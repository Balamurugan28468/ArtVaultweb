import { Link } from 'react-router'
import { PublicArtworkCard, toArtworkError } from '@/features/artwork'
import { Button, EmptyState, ErrorState, ResponsiveGrid, Skeleton } from '@/shared/ui'
import { useArtistDisplayNames } from '../hooks/useArtistDisplayNames'
import { useMarketplaceArtworks } from '../hooks/useMarketplaceArtworks'
import type { MarketplaceFilters } from '../types'

/**
 * The Marketplace results surface: a cross-seller grid of PUBLISHED
 * artworks (see useMarketplaceArtworks/marketplaceRepository.ts), each
 * card linking to its seller's existing public artist page. Deliberately
 * built from the same PublicArtworkCard Module 07 already established for
 * a single artist's catalog, rather than a parallel component — the only
 * addition here is wrapping each card in a Link and resolving the
 * artist's display name (see useArtistDisplayNames), never any owner-only
 * control, matching PublicArtworkCard's own read-only contract.
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
          <Link key={artwork.id} to={`/artists/${artwork.sellerId}`} className="block">
            <PublicArtworkCard artwork={artwork} artistDisplayName={artistNames[artwork.sellerId]} />
          </Link>
        ))}
      </ResponsiveGrid>

      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Loading more…' : 'Load more'}
          </Button>
        </div>
      ) : (
        <p className="text-center text-sm text-text-muted">You've reached the end of the marketplace.</p>
      )}
    </div>
  )
}
