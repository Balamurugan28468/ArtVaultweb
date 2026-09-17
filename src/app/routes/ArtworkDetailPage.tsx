import { Box, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useArtistProfile } from '@/features/artist-profile'
import { ArtworkGallery, ArtworkIdField, PublicArtworkCard, toArtworkError, usePublicArtwork } from '@/features/artwork'
import { AddToCartButton, useCart } from '@/features/cart'
import { LikeButton } from '@/features/likes'
import { useArtistDisplayNames, useRelatedArtworks } from '@/features/marketplace'
import { WishlistButton } from '@/features/wishlist'
import { useDocumentMeta } from '@/shared/hooks/useDocumentMeta'
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
  ShareButton,
  Skeleton,
} from '@/shared/ui'

function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1)
}

type DetailTab = 'overview' | 'details' | 'shipping' | 'reviews'
const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'details', label: 'Details' },
  { id: 'shipping', label: 'Shipping & Returns' },
  { id: 'reviews', label: 'Reviews' },
]

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
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')
  const { addItem, getQuantity, isPending } = useCart()
  const [cartPending, setCartPending] = useState(false)
  const navigate = useNavigate()

  const sellerId = artwork?.sellerId
  const artistNames = useArtistDisplayNames(sellerId ? [sellerId] : [])
  const artistName = sellerId ? artistNames[sellerId] : null
  // Real bio for the "About the Artist" panel below — the same public
  // artists/{uid} document the artist's own profile page reads, never a
  // second/duplicated data source.
  const artistProfileState = useArtistProfile(sellerId)
  const artistBio = artistProfileState.status === 'loaded' ? artistProfileState.profile.bio : null

  // UI-01 — "More in {category}", not "AI recommended": see
  // useRelatedArtworks' own comment on why that distinction matters.
  const related = useRelatedArtworks(artwork?.category, artwork?.id)
  const relatedArtistNames = useArtistDisplayNames(related.artworks.map((a) => a.sellerId))

  const canonicalUrl =
    artworkId && typeof window !== 'undefined' ? `${window.location.origin}/artworks/${artworkId}` : ''

  useDocumentMeta({
    title: artwork ? `${artwork.title} — ArtVault` : 'ArtVault',
    description: artwork?.description,
    image: artwork?.images[0]?.url,
  })

  return (
    <Container size="wide">
      <section className="flex flex-col gap-6">
        {!artworkId && (
          <EmptyState
            title="Artwork not found"
            description="This artwork doesn't exist, or isn't available."
          />
        )}

        {artworkId && query.status === 'pending' && (
          <div aria-busy="true" aria-label="Loading artwork" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
            <Skeleton className="min-h-[18rem] w-full sm:min-h-[24rem] lg:min-h-[28rem] xl:min-h-[30rem]" />
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
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
            <ArtworkGallery images={artwork.images} title={artwork.title} />

            <div className="flex flex-col gap-4">
              <h1 className="font-display text-2xl font-medium text-text-primary sm:text-3xl">{artwork.title}</h1>

              {artistName && (
                <Link to={`/artists/${artwork.sellerId}`} className="group flex w-fit items-center gap-2">
                  <Avatar name={artistName} size="sm" />
                  <span className="text-sm text-text-secondary group-hover:text-text-primary group-hover:underline">
                    {artistName}
                  </span>
                </Link>
              )}

              <div className="flex items-center gap-2">
                <p className="font-display text-2xl font-medium text-accent-gold">
                  ₹{(artwork.price / 100).toFixed(0)}
                </p>
                <Badge tone="gold">{categoryLabel(artwork.category)}</Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <WishlistButton artworkId={artwork.id} />
                <LikeButton artworkId={artwork.id} likeCount={artwork.likeCount} />
                <ShareButton url={canonicalUrl} title={artwork.title} text={`${artwork.title} on ArtVault`} />
              </div>

              {/* AI + AR entry points (UI-01 product-wide requirement) —
                  color-coded (purple = AI, blue = AR) and visually
                  distinct cards, matching how the two capabilities are
                  presented everywhere else in the app. UI-05: both now
                  navigate to their own real, dedicated page
                  (ArtworkAnalysisPage/ArtworkArPage) instead of opening an
                  inline modal — each of those pages renders the same
                  honest "not connected yet" state on its own. */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                <div className="flex flex-col gap-1.5 rounded-lg border border-brand-primary/30 bg-brand-primary/10 p-3 sm:gap-2 sm:p-4">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary/20 text-brand-primary-on-dark sm:h-9 sm:w-9">
                    <Sparkles aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <p className="text-sm font-medium text-text-primary">AI Artwork Analysis</p>
                  <p className="hidden text-xs text-text-secondary sm:block">Get AI-powered insights about this artwork's style and medium.</p>
                  <Link to={`/artworks/${artwork.id}/analysis`} className={buttonClassName('primary', 'sm', 'mt-1 self-start')}>
                    Analyze with AI
                  </Link>
                </div>
                <div className="flex flex-col gap-1.5 rounded-lg border border-blue-600/30 bg-blue-600/10 p-3 sm:gap-2 sm:p-4">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 sm:h-9 sm:w-9">
                    <Box aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <p className="text-sm font-medium text-text-primary">AR preview unavailable</p>
                  <p className="hidden text-xs text-text-secondary sm:block">Camera placement and true-scale AR are not available yet.</p>
                  <Link to={`/artworks/${artwork.id}/ar`} className={buttonClassName('info', 'sm', 'mt-1 self-start')}>
                    About AR preview
                  </Link>
                </div>
              </div>

              {/* Commerce area — deliberately separated from the actions
                  above. Add to Cart is now real (UI-02): AddToCartButton
                  writes a genuine cart line (see CartProvider), and Add & review cart
                  adds the item then takes the shopper straight to /cart.
                  Checkout itself still can't complete a real purchase (no
                  payment integration exists yet — see CheckoutPage's own
                  PaymentSection), so neither button ever pretends a
                  purchase completed. */}
              <div className="flex flex-col gap-2 border-t border-border pt-3 sm:pt-4">
                <div className="flex flex-wrap gap-2">
                  <AddToCartButton artworkId={artwork.id} inventoryCount={artwork.inventoryCount} size="md" />
                  <Button
                    type="button"
                    variant="gold"
                    size="md"
                    disabled={cartPending || isPending?.(artwork.id) || artwork.inventoryCount <= 0}
                    aria-disabled={cartPending || isPending?.(artwork.id) || artwork.inventoryCount <= 0}
                    title={artwork.inventoryCount <= 0 ? 'Sold out' : undefined}
                    onClick={async () => {
                      setCartPending(true)
                      try {
                        if (getQuantity(artwork.id) > 0 || await addItem(artwork.id, 1)) navigate('/cart')
                      } finally { setCartPending(false) }
                    }}
                  >
                    {getQuantity(artwork.id) > 0 ? 'Review cart' : 'Add & review cart'}
                  </Button>
                </div>
                <p className="text-xs text-text-muted">
                  Checkout collects shipping details. Order placement and payment processing are unavailable.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Secondary content tabs — every value shown comes from a real
            Artwork field. Our schema has no medium/size/year/edition, so
            "Details" never invents them; Shipping & Returns and Reviews
            have no backing feature yet, so both say so plainly instead of
            a fabricated policy or review count. */}
        {artwork && (
          <div className="flex flex-col gap-4">
            <div role="tablist" aria-label="Artwork information" className="flex gap-2 overflow-x-auto border-b border-border">
              {DETAIL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`artwork-tab-${tab.id}`}
                  aria-selected={activeTab === tab.id}
                  aria-controls={`artwork-panel-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-150 ease-standard ${
                    activeTab === tab.id
                      ? 'border-accent-gold text-text-primary'
                      : 'border-transparent text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div role="tabpanel" id="artwork-panel-overview" aria-labelledby="artwork-tab-overview" hidden={activeTab !== 'overview'}>
              <div className="flex flex-col gap-3">
                <p className="whitespace-pre-wrap text-text-secondary">{artwork.description}</p>
                {artwork.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {artwork.tags.map((tag) => (
                      <Badge key={tag}>#{tag}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div role="tabpanel" id="artwork-panel-details" aria-labelledby="artwork-tab-details" hidden={activeTab !== 'details'}>
              {/* Category/price already appear once, in the persistent
                  header above — deliberately not repeated here. Inventory
                  is the one real field that doesn't appear anywhere else.
                  Our schema has no medium/size/year/edition, so this tab
                  never invents them (see this page's own module comment). */}
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-text-muted">Availability</dt>
                  <dd className="text-sm text-text-primary">
                    {artwork.inventoryCount > 0 ? `${artwork.inventoryCount} available` : 'Out of stock'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Artwork ID</dt>
                  <dd className="text-sm text-text-primary">
                    <ArtworkIdField artworkId={artwork.id} />
                  </dd>
                </div>
              </dl>
            </div>

            <div role="tabpanel" id="artwork-panel-shipping" aria-labelledby="artwork-tab-shipping" hidden={activeTab !== 'shipping'}>
              <p className="text-sm text-text-secondary">
                Shipping and returns aren't connected yet — checkout, delivery, and return policies are coming in a
                later module.
              </p>
            </div>

            <div role="tabpanel" id="artwork-panel-reviews" aria-labelledby="artwork-tab-reviews" hidden={activeTab !== 'reviews'}>
              <p className="text-sm text-text-secondary">Reviews aren't connected yet.</p>
            </div>
          </div>
        )}

        {artwork && artistName && (
          <Card className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Avatar name={artistName} size="md" />
              <div className="flex flex-col gap-0.5">
                <p className="text-xs font-semibold tracking-[0.1em] text-text-muted uppercase">About the Artist</p>
                <p className="font-medium text-text-primary">{artistName}</p>
                {artistBio && <p className="max-w-md text-sm text-text-secondary">{artistBio}</p>}
              </div>
            </div>
            <Link
              to={`/artists/${artwork.sellerId}`}
              className="text-sm font-medium text-brand-primary-on-dark hover:underline"
            >
              View full profile →
            </Link>
          </Card>
        )}

        {artwork && related.artworks.length > 0 && (
          <div className="flex flex-col gap-4">
            <SectionHeader title={`More in ${categoryLabel(artwork.category)}`} />
            <ResponsiveGrid>
              {related.artworks.map((relatedArtwork) => (
                <PublicArtworkCard
                  key={relatedArtwork.id}
                  artwork={relatedArtwork}
                  artistDisplayName={relatedArtistNames[relatedArtwork.sellerId]}
                />
              ))}
            </ResponsiveGrid>
          </div>
        )}
      </section>
    </Container>
  )
}
