import { Link } from 'react-router'
import { PublicArtworkCard } from '@/features/artwork'
import { useWishlist, useWishlistArtworks } from '@/features/wishlist'
import { buttonClassName, Container, EmptyState, ErrorState, PageHeader, ResponsiveGrid, Skeleton } from '@/shared/ui'

/**
 * ArtVault's first route that is genuinely public (works for a signed-out
 * guest, per Module 09's low-friction save UX) yet also shows real,
 * per-account persisted data once signed in — the same page, the same
 * components, driven entirely by WishlistProvider's mode rather than a
 * route guard. See docs/DATABASE.md for the guest/account merge semantics.
 */
export function WishlistPage() {
  const { mode, status } = useWishlist()
  const { artworks, unavailableCount, isLoading } = useWishlistArtworks()

  return (
    <Container>
      <section className="flex flex-col gap-6">
        <PageHeader
          title="Wishlist"
          description={
            isLoading
              ? 'Loading your saved artworks…'
              : `${artworks.length} artwork${artworks.length === 1 ? '' : 's'} saved`
          }
        />

        {mode === 'guest' && artworks.length > 0 && (
          <p className="rounded-lg border border-border-strong bg-surface-elevated px-4 py-3 text-sm text-text-secondary">
            Saved on this device only.{' '}
            <Link to="/sign-in" className="font-medium text-brand-primary-on-dark hover:underline">
              Sign in
            </Link>{' '}
            to keep your wishlist across devices.
          </p>
        )}

        {status === 'error' && (
          <ErrorState
            title="Couldn't load your wishlist"
            description="Something went wrong loading your saved artworks. Please try again."
          />
        )}

        {status !== 'error' && isLoading && (
          <div aria-busy="true" aria-label="Loading wishlist">
            <ResponsiveGrid>
              <Skeleton className="aspect-square w-full" />
              <Skeleton className="aspect-square w-full" />
              <Skeleton className="aspect-square w-full" />
            </ResponsiveGrid>
          </div>
        )}

        {status !== 'error' && !isLoading && artworks.length === 0 && (
          <EmptyState
            title="You haven't saved any artworks yet"
            description="Save artwork you like while browsing, and it will show up here."
            action={
              <Link to="/explore" className={buttonClassName('primary', 'md')}>
                Explore art
              </Link>
            }
          />
        )}

        {status !== 'error' && !isLoading && artworks.length > 0 && (
          <>
            <ResponsiveGrid>
              {artworks.map((artwork) => (
                <Link key={artwork.id} to={`/artists/${artwork.sellerId}`} className="block">
                  <PublicArtworkCard artwork={artwork} />
                </Link>
              ))}
            </ResponsiveGrid>
            {unavailableCount > 0 && (
              <p className="text-center text-sm text-text-muted">
                {unavailableCount} saved artwork{unavailableCount === 1 ? ' is' : 's are'} no longer available.
              </p>
            )}
          </>
        )}
      </section>
    </Container>
  )
}
