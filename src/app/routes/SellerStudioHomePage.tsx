import { FileClock, ImageOff, Package, Plus, ShoppingBag, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import type { Artwork } from '@/features/artwork'
import { ConfirmRemoveFromSaleModal, useArtworkLifecycleActions, useSellerArtworks } from '@/features/artwork'
import { SellerStudioShell, useSellerStatus } from '@/features/seller-studio'
import { Badge, type BadgeTone, Button, Card, EmptyState, ErrorState, Skeleton, useToast } from '@/shared/ui'

function formatDate(value: Artwork['updatedAt']): string {
  const date = value?.toDate?.()
  if (!date) return ''
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** One real, computed number — never a fabricated placeholder. `caption` is for a stat with no backend path to ever become non-zero yet (Sold, Orders), said plainly rather than left to look like a silently-stuck counter. */
function StatCard({ label, value, tone = 'neutral', caption }: { label: string; value: number | string; tone?: 'gold' | 'neutral'; caption?: string }) {
  return (
    <Card className="flex flex-col gap-1 p-3 sm:p-4">
      <span className="text-xs font-medium text-text-muted">{label}</span>
      <span className={`font-display text-2xl font-medium sm:text-3xl ${tone === 'gold' ? 'text-accent-gold' : 'text-text-primary'}`}>
        {value}
      </span>
      {caption && <span className="text-[11px] text-text-muted">{caption}</span>}
    </Card>
  )
}

const STATUS_TONE: Record<Artwork['status'], BadgeTone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'gold',
  PUBLISHED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
}
const STATUS_LABEL: Record<Artwork['status'], string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Awaiting review',
  PUBLISHED: 'Published',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
}

/** Most-recently-updated artworks first, capped to a dashboard-sized preview — My Artworks (the full list) is one tab away. */
function mostRecent(artworks: Artwork[], count: number): Artwork[] {
  return [...artworks]
    .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))
    .slice(0, count)
}

const LOW_STOCK_THRESHOLD = 3

/**
 * UI-03 final correction — every artwork the Inventory Overview card ever
 * lists today is PUBLISHED (the low-stock filter only runs over
 * `publishedArtworks`), so "Remove from sale" is the only removal control
 * this row ever needs — there is no DRAFT/REJECTED entry in this section
 * to ever need a hard Delete. Reuses the exact same
 * `useArtworkLifecycleActions` hook and `ConfirmRemoveFromSaleModal` as the
 * My Artworks cards, not a second copy of the mutation wiring. Not a
 * `<Link>` itself (unlike the row's own title/stock link) so the Remove
 * button and the edit link never nest one inside the other.
 */
function InventoryOverviewRow({ artwork }: { artwork: Artwork }) {
  const { canRemoveFromSale, busy, confirmRemoveOpen, openRemove, closeRemove, confirmRemove } = useArtworkLifecycleActions(artwork)
  const toast = useToast()

  const handleConfirmRemove = async () => {
    const ok = await confirmRemove()
    toast[ok ? 'success' : 'error'](ok ? 'Removed from sale.' : 'Something went wrong. Please try again.')
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm">
      <Link to={`/seller-studio/artworks/${artwork.id}/edit`} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">
        <span className="truncate text-text-primary">{artwork.title}</span>
        <Badge tone="warning" size="sm">
          {artwork.inventoryCount} left
        </Badge>
      </Link>
      {canRemoveFromSale && (
        <button type="button" onClick={openRemove} className="shrink-0 text-xs font-medium text-text-secondary hover:underline">
          Remove from sale
        </button>
      )}
      <ConfirmRemoveFromSaleModal
        open={confirmRemoveOpen}
        onClose={closeRemove}
        onConfirm={handleConfirmRemove}
        busy={busy}
        artworkTitle={artwork.title}
      />
    </div>
  )
}

/**
 * The real Seller Studio landing page (UI-03) — replaces the UI-01/early
 * placeholder that was just three links. Every number here is computed
 * live from the seller's own real artworks (`useSellerArtworks`, the same
 * one shared Firestore listener My Artworks already uses) — never
 * fabricated. "Sold" and "Orders" stay at a real, honest 0 with a plain
 * caption explaining why: no `SOLD` artwork status and no seller-scoped
 * order query exist anywhere in this codebase yet (a buyer may only read
 * their *own* orders — see firestore.rules' `orders/{orderId}` rule from
 * UI-02 — there is no rule granting a seller read access to orders
 * containing their items). Earnings is the one stat explicitly called for
 * as a placeholder-only tile when no real data is connected — stated the
 * same honest way, never a fabricated currency figure.
 */
export function SellerStudioHomePage() {
  const statusState = useSellerStatus()
  const artworksState = useSellerArtworks()

  const stats = useMemo(() => {
    if (artworksState.status !== 'loaded') return null
    const { artworks } = artworksState
    const byStatus = (status: Artwork['status']) => artworks.filter((a) => a.status === status).length
    const publishedArtworks = artworks.filter((a) => a.status === 'PUBLISHED')
    const unitsInStock = publishedArtworks.reduce((sum, a) => sum + a.inventoryCount, 0)
    const lowStock = publishedArtworks.filter((a) => a.inventoryCount <= LOW_STOCK_THRESHOLD)
    return {
      total: artworks.length,
      drafts: byStatus('DRAFT'),
      submitted: byStatus('SUBMITTED'),
      published: byStatus('PUBLISHED'),
      unitsInStock,
      lowStock,
      recent: mostRecent(artworks, 4),
    }
  }, [artworksState])

  const shopName =
    statusState.status === 'approved' || statusState.status === 'pending' || statusState.status === 'rejected'
      ? statusState.application.businessName
      : null

  return (
    <SellerStudioShell
      title="Seller Studio"
      description={shopName ? `Managing ${shopName}` : 'Manage your ArtVault shop.'}
      actions={
        <Link to="/seller-studio/artworks/new">
          <Button type="button" variant="gold">
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add Artwork
          </Button>
        </Link>
      }
    >
      {statusState.status === 'approved' && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div>
            <h2 className="text-base font-semibold text-text-primary">{statusState.application.businessName}</h2>
            <p className="text-sm text-text-secondary">Your shop on ArtVault</p>
          </div>
          <Badge tone="success">Approved seller</Badge>
        </Card>
      )}

      {artworksState.status === 'loading' && (
        <div aria-busy="true" aria-label="Loading your seller dashboard" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {artworksState.status === 'error' && (
        <ErrorState title="Couldn't load your dashboard" description={artworksState.error.message} />
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard label="Total artworks" value={stats.total} tone="gold" />
            <StatCard label="Drafts" value={stats.drafts} />
            <StatCard label="Submitted" value={stats.submitted} />
            <StatCard label="Published" value={stats.published} />
            <StatCard label="Sold" value={0} caption="Not tracked yet" />
            <StatCard label="Orders" value={0} caption="Not connected yet" />
            <Card className="flex flex-col gap-1 p-3 sm:p-4">
              <span className="text-xs font-medium text-text-muted">Earnings</span>
              <span className="flex items-center gap-1.5 text-sm text-text-muted">
                <Wallet aria-hidden="true" className="h-4 w-4" />
                Not connected yet
              </span>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="flex flex-col gap-3 p-4 sm:p-5">
              <h2 className="font-display text-lg font-medium text-text-primary">Recent artworks</h2>
              {stats.recent.length === 0 ? (
                <EmptyState
                  title="No artworks yet"
                  description="Create your first artwork draft to get started."
                  action={
                    <Link to="/seller-studio/artworks/new" className="inline-flex">
                      <Button type="button">Add Artwork</Button>
                    </Link>
                  }
                />
              ) : (
                <ul className="flex flex-col gap-3">
                  {stats.recent.map((artwork) => (
                    <li key={artwork.id}>
                      <Link
                        to={`/seller-studio/artworks/${artwork.id}/edit`}
                        className="flex items-center gap-3 rounded-md p-1.5 transition-colors hover:bg-surface-elevated"
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-elevated">
                          {artwork.images[0] ? (
                            <img src={artwork.images[0].url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <ImageOff aria-hidden="true" className="h-4 w-4 text-text-muted" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text-primary">{artwork.title}</p>
                          <p className="text-xs text-text-muted">Updated {formatDate(artwork.updatedAt)}</p>
                        </div>
                        <Badge tone={STATUS_TONE[artwork.status]} size="sm">
                          {STATUS_LABEL[artwork.status]}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/seller-studio/artworks" className="self-start text-sm font-medium text-brand-primary-on-dark hover:underline">
                View all artworks
              </Link>
            </Card>

            <Card className="flex flex-col gap-3 p-4 sm:p-5">
              <h2 className="font-display text-lg font-medium text-text-primary">Inventory overview</h2>
              <div className="flex items-center gap-3 rounded-md border border-border-strong bg-surface-elevated p-3">
                <Package aria-hidden="true" className="h-5 w-5 shrink-0 text-accent-gold" />
                <div>
                  <p className="text-sm font-medium text-text-primary">{stats.unitsInStock} units in stock</p>
                  <p className="text-xs text-text-muted">Across {stats.published} published artwork{stats.published === 1 ? '' : 's'}</p>
                </div>
              </div>

              {stats.lowStock.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-text-muted">Low stock</p>
                  {stats.lowStock.map((artwork) => (
                    <InventoryOverviewRow key={artwork.id} artwork={artwork} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted">No published artwork is running low on stock.</p>
              )}

              {/* Seller Orders — honest, not fabricated: no rule anywhere
                  grants a seller read access to orders containing their
                  items yet (see this component's own file comment). */}
              <div className="flex items-start gap-2 border-t border-border pt-3 text-sm text-text-muted">
                <ShoppingBag aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Seller order management isn't connected yet — orders containing your artworks will appear here once it is.</p>
              </div>
            </Card>
          </div>

          <Card className="flex flex-wrap items-center gap-2 p-4 sm:p-5">
            <span className="mr-1 flex items-center gap-1.5 text-sm font-medium text-text-secondary">
              <FileClock aria-hidden="true" className="h-4 w-4" />
              Quick actions
            </span>
            <Link to="/seller-studio/artworks/new">
              <Button type="button" variant="gold" size="sm">
                <Plus aria-hidden="true" className="h-4 w-4" />
                Add Artwork
              </Button>
            </Link>
            <Link to="/seller-studio/artworks">
              <Button type="button" variant="secondary" size="sm">
                My Artworks
              </Button>
            </Link>
            <Link to="/seller-studio/profile">
              <Button type="button" variant="secondary" size="sm">
                Public Profile
              </Button>
            </Link>
          </Card>
        </>
      )}
    </SellerStudioShell>
  )
}
