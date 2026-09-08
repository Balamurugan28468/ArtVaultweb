import { Link } from 'react-router'
import { PublicArtworkCard, toArtworkError } from '@/features/artwork'
import { DEFAULT_MARKETPLACE_FILTERS, useArtistDisplayNames, useMarketplaceArtworks } from '@/features/marketplace'
import {
  Button,
  buttonClassName,
  Card,
  Container,
  EmptyState,
  ErrorState,
  ResponsiveGrid,
  SectionHeader,
  Skeleton,
} from '@/shared/ui'

// How many of the newest published artworks the Home page shows — a
// preview, not the full catalog (see the "Explore" CTA below). Kept below
// MARKETPLACE_PAGE_SIZE (12) so Home never looks like a second Marketplace
// page. Module 10 Phase 2: this section renders only real, live published
// artworks via the same marketplace query infrastructure Explore uses — it
// never fabricates artworks, ratings, sales, or trending status, and never
// repeats the same artwork to fill space when few exist.
const HOME_PREVIEW_COUNT = 8

export function HomePage() {
  const query = useMarketplaceArtworks(DEFAULT_MARKETPLACE_FILTERS)
  const artworks = (query.data?.pages[0]?.artworks ?? []).slice(0, HOME_PREVIEW_COUNT)
  const artistNames = useArtistDisplayNames(artworks.map((artwork) => artwork.sellerId))

  return (
    <Container>
      <section className="flex flex-col gap-10">
        <Card className="relative overflow-hidden px-6 py-12 text-center sm:px-10 sm:py-16">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-br from-brand-primary/15 via-transparent to-accent-gold/10"
          />
          <div className="relative flex flex-col items-center gap-3">
            <p className="text-xs font-semibold tracking-[0.2em] text-accent-gold uppercase">Art Beyond Limits</p>
            <h1 className="font-display text-3xl font-medium text-text-primary sm:text-4xl">Welcome to ArtVault</h1>
            <p className="max-w-xl text-text-secondary">
              A home for discovering, collecting, and trading original art from independent artists.
            </p>
            <Link to="/explore" className={buttonClassName('primary', 'lg', 'mt-2')}>
              Explore the marketplace
            </Link>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <SectionHeader
            title="Recently published"
            actions={
              <Link to="/explore" className="text-sm font-medium text-brand-primary-on-dark hover:underline">
                View all
              </Link>
            }
          />

          {query.status === 'pending' && (
            <div aria-busy="true" aria-label="Loading recently published artworks">
              <ResponsiveGrid>
                <Skeleton className="aspect-square w-full" />
                <Skeleton className="aspect-square w-full" />
                <Skeleton className="aspect-square w-full" />
                <Skeleton className="aspect-square w-full" />
              </ResponsiveGrid>
            </div>
          )}

          {query.status === 'error' && (
            <ErrorState
              title="Couldn't load recently published artworks"
              description={toArtworkError(query.error).message}
              action={
                <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
                  Try again
                </Button>
              }
            />
          )}

          {query.status === 'success' && artworks.length === 0 && (
            <EmptyState
              title="No artworks published yet"
              description="ArtVault is just getting started — check back soon, or explore the marketplace to see what's already there."
              action={
                <Link to="/explore" className={buttonClassName('secondary', 'sm')}>
                  Go to Explore
                </Link>
              }
            />
          )}

          {query.status === 'success' && artworks.length > 0 && (
            <ResponsiveGrid>
              {artworks.map((artwork) => (
                <Link key={artwork.id} to={`/artists/${artwork.sellerId}`} className="block">
                  <PublicArtworkCard artwork={artwork} artistDisplayName={artistNames[artwork.sellerId]} />
                </Link>
              ))}
            </ResponsiveGrid>
          )}
        </div>
      </section>
    </Container>
  )
}
