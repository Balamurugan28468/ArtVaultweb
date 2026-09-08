import { Link, useParams } from 'react-router'
import { ArtworkGallery, toArtworkError, usePublicArtwork } from '@/features/artwork'
import { useArtistDisplayNames } from '@/features/marketplace'
import { WishlistButton } from '@/features/wishlist'
import { useDocumentMeta } from '@/shared/hooks/useDocumentMeta'
import { Avatar, Badge, Button, Container, EmptyState, ErrorState, ShareButton, Skeleton } from '@/shared/ui'

function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1)
}

/**
 * ArtVault's canonical public URL for one specific artwork (Module 11) —
 * every artwork-card consumer (Marketplace, the artist page's own grid,
 * Home, Wishlist) links here now instead of straight to the seller's
 * catalog page; see `PublicArtworkCard`. Genuinely public: works whether
 * or not anyone is signed in, matching `artworks/{artworkId}`'s existing
 * `status == 'PUBLISHED'` read rule — no `firestore.rules` change was
 * needed for this page (see `docs/DATABASE.md`).
 *
 * `usePublicArtwork` (a one-shot TanStack Query read, never a listener)
 * already collapses "doesn't exist," "exists but private," and "exists but
 * not PUBLISHED" into the same `null` result — this page deliberately
 * never distinguishes those cases in its own UI either, so a guessed or
 * stale artwork id never reveals whether *something* is there.
 */
export function ArtworkDetailPage() {
  const { artworkId } = useParams()
  const query = usePublicArtwork(artworkId)
  const artwork = query.status === 'success' ? query.data : undefined

  const sellerId = artwork?.sellerId
  const artistNames = useArtistDisplayNames(sellerId ? [sellerId] : [])
  const artistName = sellerId ? artistNames[sellerId] : null

  const canonicalUrl =
    artworkId && typeof window !== 'undefined' ? `${window.location.origin}/artworks/${artworkId}` : ''

  useDocumentMeta({
    title: artwork ? `${artwork.title} — ArtVault` : 'ArtVault',
    description: artwork?.description,
    image: artwork?.images[0]?.url,
  })

  return (
    <Container>
      <section className="flex flex-col gap-6">
        {!artworkId && (
          <EmptyState
            title="Artwork not found"
            description="This artwork doesn't exist, or isn't available."
          />
        )}

        {artworkId && query.status === 'pending' && (
          <div aria-busy="true" aria-label="Loading artwork" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Skeleton className="min-h-[20rem] w-full sm:min-h-[28rem] lg:min-h-[34rem]" />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-6 w-1/4" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        )}

        {artworkId && query.status === 'error' && (
          <ErrorState
            title="Couldn't load this artwork"
            description={toArtworkError(query.error).message}
            action={
              <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
                Try again
              </Button>
            }
          />
        )}

        {artworkId && query.status === 'success' && !artwork && (
          <EmptyState
            title="Artwork not found"
            description="This artwork doesn't exist, or isn't available."
          />
        )}

        {artwork && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <ArtworkGallery images={artwork.images} title={artwork.title} />

            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <h1 className="font-display text-2xl font-medium text-text-primary sm:text-3xl">{artwork.title}</h1>
                <div className="flex shrink-0 items-center gap-1">
                  <WishlistButton artworkId={artwork.id} />
                  <ShareButton url={canonicalUrl} title={artwork.title} text={`${artwork.title} on ArtVault`} />
                </div>
              </div>

              {artistName && (
                <Link to={`/artists/${artwork.sellerId}`} className="group flex w-fit items-center gap-2">
                  <Avatar name={artistName} size="sm" />
                  <span className="text-sm text-text-secondary group-hover:text-text-primary group-hover:underline">
                    {artistName}
                  </span>
                </Link>
              )}

              <p className="font-display text-2xl font-medium text-text-primary">
                ₹{(artwork.price / 100).toFixed(0)}
              </p>

              <p className="whitespace-pre-wrap text-text-secondary">{artwork.description}</p>

              <div className="flex flex-wrap gap-2">
                <Badge tone="gold">{categoryLabel(artwork.category)}</Badge>
                {artwork.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </Container>
  )
}
