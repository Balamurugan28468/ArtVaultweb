import { Box, Gavel, Heart, ShieldCheck, Sparkles, Store } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link } from 'react-router'
import { PublicArtworkCard, toArtworkError } from '@/features/artwork'
import { DEFAULT_MARKETPLACE_FILTERS, useArtistDisplayNames, useMarketplaceArtworks } from '@/features/marketplace'
import {
  Avatar,
  Badge,
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

// UI-01 caps how many distinct artists the "Featured Artists" strip shows —
// it is derived entirely from the same already-fetched preview artworks
// above (no second Firestore query), so this is a ceiling on a real,
// already-loaded set, never a target count to pad out.
const FEATURED_ARTIST_COUNT = 6

interface PlatformBenefit {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  // UI-01's AR+AI product-wide requirement: these three name real,
  // permanent ArtVault capabilities that aren't connected yet (see
  // docs/AI_ARCHITECTURE.md / docs/AR_ARCHITECTURE.md / Home's own Auctions
  // section above) — marked honestly rather than presented as already live.
  comingSoon?: boolean
  // Color convention (UI-01): purple = AI, blue = AR, gold = everything
  // else — reused from PublicArtworkCard/ArtworkDetailPage so the same
  // capability always reads the same color everywhere it appears.
  accent?: 'ai' | 'ar'
}

const ACCENT_CLASSES: Record<'gold' | 'ai' | 'ar', string> = {
  gold: 'bg-accent-gold/15 text-accent-gold',
  ai: 'bg-brand-primary/15 text-brand-primary-on-dark',
  ar: 'bg-blue-600/15 text-blue-400',
}

const PLATFORM_BENEFITS: PlatformBenefit[] = [
  { icon: Store, title: 'Direct from independent artists', description: "Every listing is a real artist's own work, reviewed before it goes live." },
  { icon: Sparkles, title: 'AI-powered art insights', description: 'Ask ArtVault AI about a piece, or get an AI analysis of its style and medium.', comingSoon: true, accent: 'ai' },
  { icon: Box, title: 'AR preview unavailable', description: 'Camera placement and true-scale viewing are not available yet.', comingSoon: true, accent: 'ar' },
  // UI-04: Auctions is now a real page — no longer `comingSoon`.
  { icon: Gavel, title: 'Curated auctions', description: 'Bid on hand-picked artwork in a live weekly auction.' },
  { icon: ShieldCheck, title: 'Secure by design', description: 'Firebase-backed accounts with role-based access for buyers, sellers, and admins.' },
  { icon: Heart, title: 'Save what you love', description: 'Build a Wishlist as you browse, on this device or synced to your account.' },
]

export function HomePage() {
  const query = useMarketplaceArtworks(DEFAULT_MARKETPLACE_FILTERS)
  const artworks = (query.data?.pages[0]?.artworks ?? []).slice(0, HOME_PREVIEW_COUNT)
  const artistNames = useArtistDisplayNames(artworks.map((artwork) => artwork.sellerId))

  // The hero's editorial image (UI-01 visual refinement) — the most
  // recently published artwork that actually *has* a photo. Never a
  // fabricated/stock image: when nothing published yet has a photo, the
  // hero simply renders without one (see the gradient-only fallback below)
  // rather than inventing one. Deliberately shown without its title/price
  // here — those already appear once, on its own card in "Recently
  // published" below; repeating them in the hero would be redundant, not
  // reassuring.
  const heroArtwork = artworks.find((artwork) => artwork.images[0])
  const heroImageUrl = heroArtwork?.images[0]?.url

  const featuredArtists = Array.from(new Set(artworks.map((artwork) => artwork.sellerId)))
    .map((sellerId) => ({ sellerId, name: artistNames[sellerId] }))
    .filter((artist): artist is { sellerId: string; name: string } => !!artist.name)
    .slice(0, FEATURED_ARTIST_COUNT)

  return (
    <Container size="wide">
      <section className="flex flex-col gap-6 sm:gap-8 lg:gap-10">
        {/* Cinematic hero (UI-01 reference-driven rebuild): a real published
            artwork's own photo fills the entire hero as a background image
            — never a stock/fabricated visual — with the same gradient
            scrim treatment a premium gallery site uses for legibility.
            Falls back to a plain gradient panel (no image at all) the
            moment nothing published yet has a photo, so an early/empty
            catalog never shows a broken or placeholder background. */}
        <Card
          className="relative isolate min-h-[20rem] overflow-hidden p-0 sm:min-h-[26rem] md:min-h-[30rem] lg:min-h-[34rem]"
          style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        >
          {heroImageUrl ? (
            // Below `lg` the text column spans nearly the full width (there
            // is no real "left half" at phone/tablet widths), so a
            // left-to-right fade would leave text sitting on a barely-
            // tinted image and hurt legibility — a uniform, more opaque
            // scrim covers the whole hero there instead. The fade-to-
            // visible-image-on-the-right composition only turns on at
            // `lg:`, where the text genuinely only occupies the left
            // portion (`lg:max-w-xl` below).
            <div aria-hidden="true" className="absolute inset-0 bg-bg/80 lg:bg-gradient-to-r lg:from-bg lg:via-bg/60 lg:to-transparent" />
          ) : (
            // Owner correction: the previous fallback (15%/10% opacity over
            // a dark surface) read as "a huge mostly empty dark hero" when
            // nothing published yet has a photo — a real, honest gap, not a
            // fabricated-image fix. Never invents a stock/demo image; instead
            // makes the no-photo state itself feel intentional: a stronger
            // two-tone glow plus a faint dot texture, both pure CSS.
            <>
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-brand-primary/35 via-surface to-accent-gold/25" />
              <div
                aria-hidden="true"
                className="absolute inset-0 opacity-40"
                style={{
                  backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)',
                  backgroundSize: '24px 24px',
                }}
              />
              <div aria-hidden="true" className="absolute top-1/2 right-0 h-[28rem] w-[28rem] -translate-y-1/2 translate-x-1/3 rounded-full bg-accent-gold/20 blur-3xl" />
            </>
          )}
          <div className="relative flex h-full min-h-[20rem] flex-col justify-center gap-3 px-4 py-8 xs:px-6 sm:min-h-[26rem] sm:gap-4 sm:px-10 sm:py-12 md:min-h-[30rem] md:py-16 lg:min-h-[34rem] lg:max-w-xl lg:py-20">
            <p className="text-xs font-semibold tracking-[0.2em] text-accent-gold uppercase">Art Beyond Limits</p>
            <h1 className="font-display text-4xl font-medium text-text-primary sm:text-5xl lg:text-6xl">
              Discover
              <br />
              Collect
              <br />
              <span className="text-accent-gold">Belong</span>
            </h1>
            <p className="max-w-md text-sm text-text-secondary sm:text-base">
              ArtVault connects independent artists directly with collectors — every listing is a real artist's own
              work, reviewed before it goes live.
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 sm:mt-2 sm:gap-3">
              <Link to="/explore" className={buttonClassName('gold', 'md')}>
                Explore Artworks
              </Link>
              <Link to="/seller/apply" className={buttonClassName('secondary', 'md')}>
                Sell on ArtVault
              </Link>
            </div>
          </div>
        </Card>

        {/* UI-01 mobile density correction: Home's own Categories chip row
            (and its "View all") was a second, duplicate category-discovery
            surface — Explore already owns this (category strip, sidebar
            filter, real counts, ?category= deep-linking). Removed rather
            than shrunk; category discovery lives in exactly one place now. */}

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
                <PublicArtworkCard key={artwork.id} artwork={artwork} artistDisplayName={artistNames[artwork.sellerId]} />
              ))}
            </ResponsiveGrid>
          )}
        </div>

        {featuredArtists.length > 0 && (
          <div className="flex flex-col gap-4">
            <SectionHeader title="Featured artists" />
            {/* A small horizontal card, not a lone avatar floating in open
                space — reads as compact and intentional whether there's 1
                artist or 6, since the row just wraps rather than stretching. */}
            <div className="flex flex-wrap gap-3">
              {featuredArtists.map(({ sellerId, name }) => (
                <Link
                  key={sellerId}
                  to={`/artists/${sellerId}`}
                  aria-label={`View ${name}'s profile`}
                  className="flex w-56 items-center gap-3 rounded-lg border border-border bg-surface p-3 transition-colors duration-150 ease-standard hover:border-accent-gold/60"
                >
                  <Avatar name={name} size="md" />
                  <div className="flex min-w-0 flex-col">
                    <span aria-hidden="true" className="truncate text-sm font-medium text-text-primary">
                      {name}
                    </span>
                    <span aria-hidden="true" className="text-xs text-text-muted">
                      Artist
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <SectionHeader title="Auctions" />
          {/* UI-04: Auctions is now a real page — this card links straight
              into it instead of a static "Coming soon" placeholder. The
              copy stays honest either way: if no auction is currently
              scheduled/live, AuctionsPage itself says so plainly rather
              than this card implying one exists. */}
          <Link to="/auctions" className="block">
            <Card className="flex flex-col items-start gap-3 p-6 transition-colors duration-150 ease-standard hover:border-accent-gold/50 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-gold/15 text-accent-gold">
                  <Gavel aria-hidden="true" className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium text-text-primary">Weekly curated auctions</p>
                  <p className="text-sm text-text-secondary">Bid on hand-picked artwork in a live weekly auction.</p>
                </div>
              </div>
              <Badge tone="gold">View Auctions</Badge>
            </Card>
          </Link>
        </div>

        <div className="flex flex-col gap-4">
          <SectionHeader title="Why ArtVault" />
          {/* UI-01 mobile density correction (round 2): these are informational
              cards with real sentences, not compact product cards — forcing them
              into 2 narrow columns even on very small phones (as a plain
              `grid-cols-2` did) squeezed their descriptions unreadably. Below
              `sm` they scroll horizontally as full-width-ish cards (no forced
              column squeeze, no truncation); at `sm` and up, where a column has
              real width to hold a full sentence, they settle into a grid. The
              icon/title/badge layout itself (icon own row, badge inline with
              title) is unchanged from the previous round's fix. */}
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:pb-0 sm:snap-none lg:grid-cols-3">
            {PLATFORM_BENEFITS.map(({ icon: Icon, title, description, comingSoon, accent }) => (
              <Card
                key={title}
                className="flex w-[82%] shrink-0 snap-start flex-col gap-2 p-4 sm:w-auto sm:shrink sm:p-5"
              >
                <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 ${ACCENT_CLASSES[accent ?? 'gold']}`}>
                  <Icon aria-hidden="true" className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-medium text-text-primary sm:text-base">{title}</p>
                  {comingSoon && (
                    <Badge tone="gold" size="sm">
                      Soon
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-text-secondary sm:text-sm">{description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </Container>
  )
}
