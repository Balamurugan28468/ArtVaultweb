import { PublicArtworkCard, toArtworkError } from '@/features/artwork'
import { Button, EmptyState, ErrorState, ResponsiveGrid, Skeleton } from '@/shared/ui'
import { useArtistDisplayNames } from '../hooks/useArtistDisplayNames'
import { useMarketplaceArtworks } from '../hooks/useMarketplaceArtworks'
import type { MarketplaceFilters } from '../types'

/**
 * The Marketplace results surface: a cross-seller grid of PUBLISHED
 * artworks (see useMarketplaceArtworks/marketplaceRepository.ts).
 * Deliberately built from the same PublicArtworkCard Module 07 already
 * established for a single artist's catalog, rather than a parallel
 * component — the only addition here is resolving the artist's display
 * name (see useArtistDisplayNames) to pass through, never any owner-only
 * control, matching PublicArtworkCard's own read-only contract.
 * PublicArtworkCard owns its own navigation (image/title -> the artwork's
 * own page, artist name -> the artist's page — Module 11) — this grid no
 * longer wraps each card in its own Link.
 */
export function MarketplaceGrid({ filters }: { filters: MarketplaceFilters }) {
  const query = useMarketplaceArtworks(filters)
  const artworks = query.data?.pages.flatMap((page) => page.artworks) ?? []
  const artistNames = useArtistDisplayNames(artworks.map((artwork) => artwork.sellerId))

  if (query.status === 'pending') {
    return (
      <div aria-busy="true" aria-label="Loading marketplace artworks">
        <ResponsiveGrid>
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="aspect-square w-full" />
        </ResponsiveGrid>
      </div>
    )
  }

  if (query.status === 'error') {
    const error = toArtworkError(query.error)
    return (
      <ErrorState
        title="Couldn't load the marketplace"
        description={error.message}
        action={
          <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
            Try again
          </Button>
        }
      />
    )
  }

  if (artworks.length === 0) {
    return (
      <EmptyState
        title="No artworks match these filters"
        description="Try a different category, price range, or clear your filters to see everything published so far."
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <ResponsiveGrid>
        {artworks.map((artwork) => (
          <PublicArtworkCard key={artwork.id} artwork={artwork} artistDisplayName={artistNames[artwork.sellerId]} />
        ))}
      </ResponsiveGrid>

      {query.hasNextPage ? (
        // Module 10 Phase 2: left-aligned, not centered in the outer flex
        // column — the grid track (see ResponsiveGrid) only ever spans as
        // many columns as there are results, so centering this against the
        // *container's* full width drifted it away from a sparse result
        // set's actual cards instead of sitting naturally below them.
        <div className="flex justify-start">
          <Button variant="secondary" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Loading more…' : 'Load more'}
          </Button>
        </div>
      ) : (
        <p className="text-left text-sm text-text-muted">You've reached the end of the marketplace.</p>
      )}
    </div>
  )
}
