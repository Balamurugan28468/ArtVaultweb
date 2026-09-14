import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArtworkList, useSellerArtworks, type ArtworkStatus } from '@/features/artwork'
import { SellerStudioShell } from '@/features/seller-studio'
import { buttonClassName, Card, Chip, EmptyState, ErrorState, Skeleton } from '@/shared/ui'

const FILTERS: { id: 'ALL' | ArtworkStatus; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'DRAFT', label: 'Draft' },
  { id: 'SUBMITTED', label: 'Awaiting review' },
  { id: 'PUBLISHED', label: 'Published' },
  { id: 'REJECTED', label: 'Rejected' },
]

// Stable reference for the "not loaded yet" case — a fresh `[]` literal
// inline below would give useMemo a "changed" dependency on every render
// even while genuinely empty, defeating the memoization (same fix as
// OrdersPage's own NO_ORDERS, UI-02).
const NO_ARTWORKS: never[] = []

export function ArtworkListPage() {
  const state = useSellerArtworks()
  const [activeFilter, setActiveFilter] = useState<'ALL' | ArtworkStatus>('ALL')

  const artworks = state.status === 'loaded' ? state.artworks : NO_ARTWORKS
  const filteredArtworks = useMemo(
    () => (activeFilter === 'ALL' ? artworks : artworks.filter((a) => a.status === activeFilter)),
    [artworks, activeFilter],
  )

  return (
    <SellerStudioShell
      title="My Artworks"
      description={
        state.status === 'loaded' ? `${artworks.length} artwork${artworks.length === 1 ? '' : 's'} total` : undefined
      }
      actions={
        <Link to="/seller-studio/artworks/new" className={buttonClassName('primary', 'md')}>
          Create Artwork
        </Link>
      }
    >
      {state.status === 'loading' && (
        <Card aria-busy="true" aria-label="Loading your artworks" className="flex flex-col gap-3 p-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
        </Card>
      )}

      {state.status === 'error' && <ErrorState title="Couldn't load your artworks" description={state.error.message} />}

      {state.status === 'loaded' && artworks.length > 0 && (
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 xs:mx-0 xs:flex-wrap xs:px-0 xs:pb-0">
          {FILTERS.map((filter) => (
            <Chip
              key={filter.id}
              label={filter.label}
              selected={activeFilter === filter.id}
              onClick={() => setActiveFilter(filter.id)}
            />
          ))}
        </div>
      )}

      {state.status === 'loaded' && artworks.length === 0 && (
        <EmptyState
          title="No artworks yet"
          description="Create your first artwork draft to get started."
          action={
            <Link to="/seller-studio/artworks/new" className={buttonClassName('primary', 'md')}>
              Create Artwork
            </Link>
          }
        />
      )}

      {state.status === 'loaded' && artworks.length > 0 && filteredArtworks.length === 0 && (
        <EmptyState title="No artworks match this filter" description="Try a different status filter above." />
      )}

      {state.status === 'loaded' && filteredArtworks.length > 0 && <ArtworkList artworks={filteredArtworks} />}
    </SellerStudioShell>
  )
}
