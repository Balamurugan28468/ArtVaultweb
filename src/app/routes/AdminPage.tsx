import { useState } from 'react'
import { ArtworkModerationQueue, SellerApplicationQueue, usePendingSellerApplications, useSubmittedArtworks } from '@/features/admin'
import { Container, PageHeader } from '@/shared/ui'

type AdminTab = 'sellers' | 'artworks'

const TAB_CLASSNAME = (active: boolean) =>
  `px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
    active ? 'border-brand-primary text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
  }`

/**
 * Module 13 Phase 3 — the Admin Control Center. Gated by `RequireRole(['ADMIN',
 * 'SUPER_ADMIN'])` in router.tsx, itself nested inside `RequireAuth` — but
 * that guard is a UX/redirect convenience only, exactly like every other
 * `RequireRole` usage in this app; the real authority is
 * `functions/src/adminActions.ts`'s `requireAdminCaller`, which independently
 * re-derives the caller's role from the verified `request.auth.token.role`
 * claim for every single privileged call, and `firestore.rules`' own
 * Module 13 Phase 3 read grant for the two queues below. This page never
 * performs a privileged write itself — both queues delegate every
 * approve/reject/publish decision to the callable-backed hooks in
 * `@/features/admin`.
 *
 * Both queues' counts are fetched eagerly (not just the active tab's), so
 * the tab labels show a real, live count immediately rather than only after
 * switching — TanStack Query's shared cache means this never issues a
 * second network request once a tab's own queue component mounts and reads
 * the same query key.
 */
export function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('sellers')
  const sellerQueue = usePendingSellerApplications()
  const artworkQueue = useSubmittedArtworks()

  const sellerCount = sellerQueue.data?.length
  const artworkCount = artworkQueue.data?.length

  return (
    <Container>
      <section className="flex flex-col gap-6">
        <PageHeader title="Admin Control Center" description="Review seller applications and moderate submitted artwork." />

        <div role="tablist" aria-label="Admin sections" className="flex gap-2 border-b border-border">
          <button
            type="button"
            role="tab"
            id="admin-tab-sellers"
            aria-selected={tab === 'sellers'}
            aria-controls="admin-panel-sellers"
            className={TAB_CLASSNAME(tab === 'sellers')}
            onClick={() => setTab('sellers')}
          >
            Seller Applications{typeof sellerCount === 'number' ? ` (${sellerCount})` : ''}
          </button>
          <button
            type="button"
            role="tab"
            id="admin-tab-artworks"
            aria-selected={tab === 'artworks'}
            aria-controls="admin-panel-artworks"
            className={TAB_CLASSNAME(tab === 'artworks')}
            onClick={() => setTab('artworks')}
          >
            Artwork Moderation{typeof artworkCount === 'number' ? ` (${artworkCount})` : ''}
          </button>
        </div>

        <div role="tabpanel" id="admin-panel-sellers" aria-labelledby="admin-tab-sellers" hidden={tab !== 'sellers'}>
          {tab === 'sellers' && <SellerApplicationQueue />}
        </div>
        <div role="tabpanel" id="admin-panel-artworks" aria-labelledby="admin-tab-artworks" hidden={tab !== 'artworks'}>
          {tab === 'artworks' && <ArtworkModerationQueue />}
        </div>
      </section>
    </Container>
  )
}
