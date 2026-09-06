import { usePublishedArtworks } from '../hooks/usePublishedArtworks'
import { PublicArtworkCard } from './PublicArtworkCard'
import { EmptyState, ErrorState, ResponsiveGrid, Skeleton } from '@/shared/ui'

/**
 * A seller's real PUBLISHED catalog, rendered publicly (see
 * usePublishedArtworks — public, works whether or not anyone is signed
 * in). DRAFT/SUBMITTED/REJECTED artworks are never fetched by this
 * component at all, not merely filtered out client-side — the query itself
 * (`sellerId == X && status == 'PUBLISHED'`) can never return them.
 */
export function PublicArtworkGrid({ sellerId }: { sellerId: string }) {
  const state = usePublishedArtworks(sellerId)

  if (state.status === 'loading') {
    return (
      <div aria-busy="true" aria-label="Loading published artworks">
        <ResponsiveGrid>
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="aspect-square w-full" />
        </ResponsiveGrid>
      </div>
    )
  }

  if (state.status === 'error') {
    return <ErrorState title="Couldn't load this artist's artworks" description={state.error.message} />
  }

  if (state.artworks.length === 0) {
    return (
      <EmptyState
        title="No public artworks yet"
        description="This artist hasn't published any artworks yet."
      />
    )
  }

  return (
    <ResponsiveGrid>
      {state.artworks.map((artwork) => (
        <PublicArtworkCard key={artwork.id} artwork={artwork} />
      ))}
    </ResponsiveGrid>
  )
}
