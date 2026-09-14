import { Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  AuctionCard,
  AuctionCountdownBoxes,
  deriveAuctionStatus,
  useAuctionArtworks,
  useAuctions,
  type Auction,
  type AuctionStatus,
} from '@/features/auctions'
import { useArtistDisplayNames } from '@/features/marketplace'
import { Button, Card, Container, EmptyState, ErrorState, Modal, ResponsiveGrid, Skeleton } from '@/shared/ui'

// Stable reference for the "not loaded yet" case — a fresh `[]` literal
// inline below would give useMemo a "changed" dependency on every render
// even while genuinely empty (same fix OrdersPage's own NO_ORDERS applies).
const NO_AUCTIONS: Auction[] = []

const TABS: { id: AuctionStatus; label: string }[] = [
  { id: 'SCHEDULED', label: 'Upcoming Auctions' },
  { id: 'LIVE', label: 'Live Now' },
  { id: 'ENDED', label: 'Past Auctions' },
]

const EMPTY_COPY: Record<AuctionStatus, { title: string; description: string }> = {
  SCHEDULED: { title: 'No upcoming auctions', description: 'Check back soon for the next curated auction.' },
  LIVE: { title: 'No auctions are live right now', description: 'Live bidding will appear here the moment an auction opens.' },
  ENDED: { title: 'No past auctions yet', description: 'Completed auctions will show up here once one has ended.' },
}

/**
 * UI-04 — the Auctions landing page (visual-matching pass). Real data
 * throughout: a genuinely empty `auctions` collection today (see
 * auctionsRepository.ts) means every tab honestly shows its own empty
 * state rather than any fabricated auction. Bucketing into Upcoming/Live/
 * Past is computed client-side from each auction's real `startAt`/`endAt`
 * against the current time (see deriveAuctionStatus). The hero's
 * background photo — when the soonest upcoming auction's linked artwork
 * has one — reuses HomePage's own "real published photo, never a
 * stock/fabricated image" hero convention; it falls back to a pure-CSS
 * gradient exactly like HomePage does when no photo exists yet.
 */
export function AuctionsPage() {
  const [activeTab, setActiveTab] = useState<AuctionStatus>('SCHEDULED')
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const state = useAuctions()
  const auctions = state.status === 'loaded' ? state.auctions : NO_AUCTIONS

  const bucketed = useMemo(() => {
    const buckets: Record<AuctionStatus, Auction[]> = { SCHEDULED: [], LIVE: [], ENDED: [] }
    for (const auction of auctions) buckets[deriveAuctionStatus(auction)].push(auction)
    return buckets
  }, [auctions])

  const nextUpcoming = bucketed.SCHEDULED[0]
  const activeAuctions = bucketed[activeTab]
  const artworks = useAuctionArtworks(activeAuctions.map((auction) => auction.artworkId))
  const heroArtworks = useAuctionArtworks(nextUpcoming ? [nextUpcoming.artworkId] : [])
  const heroImageUrl = nextUpcoming ? heroArtworks[nextUpcoming.artworkId]?.images[0]?.url : undefined
  const artistNames = useArtistDisplayNames(activeAuctions.map((auction) => auction.sellerId).filter(Boolean))

  return (
    <Container size="wide">
      <section className="flex flex-col gap-6 sm:gap-8">
        {/* Hero — see this file's own header comment on the real-photo/
            gradient-fallback convention. A real, fixed height (not
            excessively tall — capped at 22rem even on wide desktop) with a
            much heavier dark overlay than a standard hero, so a photo
            background never competes with the gold headline/countdown —
            a deliberately cinematic, "auction banner" treatment rather
            than a lightly-tinted generic hero card. */}
        <Card
          className="relative isolate min-h-[19rem] overflow-hidden p-0 sm:min-h-[20rem] lg:min-h-[22rem]"
          style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        >
          {heroImageUrl ? (
            <>
              <div aria-hidden="true" className="absolute inset-0 bg-bg/85" />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-bg via-bg/75 to-bg/40" />
            </>
          ) : (
            <>
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-bg via-surface to-bg" />
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-brand-primary/20 via-transparent to-accent-gold/15" />
              <div
                aria-hidden="true"
                className="absolute inset-0 opacity-30"
                style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
              />
              <div aria-hidden="true" className="absolute top-1/2 right-0 h-[24rem] w-[24rem] -translate-y-1/2 translate-x-1/3 rounded-full bg-accent-gold/15 blur-3xl" />
            </>
          )}

          <div className="relative flex h-full flex-col justify-center gap-4 px-4 py-6 xs:px-6 sm:gap-6 sm:px-10 lg:flex-row lg:items-center lg:justify-between lg:py-0">
            <div className="flex max-w-md flex-col gap-2">
              <h1 className="font-display text-3xl font-medium text-text-primary sm:text-4xl lg:text-5xl">
                Live <span className="text-accent-gold">Auctions</span>
              </h1>
              <p className="text-sm text-text-secondary sm:text-base">
                Bid on extraordinary artworks from talented artists around the world. Own a piece of inspiration.
              </p>
            </div>

            {state.status === 'loaded' && nextUpcoming && (
              // A plain, fully self-contained div here rather than the
              // shared Card component — this sits over a photo background
              // and needs its own translucent/backdrop-blur treatment,
              // which would otherwise have to fight Card's own opaque
              // default background at equal specificity.
              <div className="flex flex-col gap-3 rounded-xl border border-border-strong bg-surface/90 p-4 shadow-card backdrop-blur-sm sm:min-w-[19rem]">
                <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">Next Auction Starts In</p>
                <AuctionCountdownBoxes auction={nextUpcoming} />
                <Link to={`/auctions/${nextUpcoming.id}`} className="inline-flex">
                  <Button type="button" variant="gold" size="md" className="w-full">
                    View Upcoming Auction →
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </Card>

        {/* Segmented tab control — a filled gold pill for the active tab
            (matching the reference), rather than Chip's own bordered
            style, which stays unchanged for its other, unrelated callers
            (Orders/Marketplace) elsewhere in the app. */}
        <div role="tablist" aria-label="Auction status" className="flex w-fit gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-md px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-150 ease-standard sm:px-4 ${
                activeTab === tab.id ? 'bg-accent-gold text-bg' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.id === 'LIVE' ? `${tab.label} (${bucketed.LIVE.length})` : tab.label}
            </button>
          ))}
        </div>

        {state.status === 'error' && <ErrorState title="Couldn't load auctions" description={state.error.message} />}

        {state.status === 'loading' && (
          <div aria-busy="true" aria-label="Loading auctions" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            <Skeleton className="aspect-[4/5] w-full" />
            <Skeleton className="aspect-[4/5] w-full" />
            <Skeleton className="hidden aspect-[4/5] w-full md:block" />
            <Skeleton className="hidden aspect-[4/5] w-full xl:block" />
          </div>
        )}

        {state.status === 'loaded' && activeAuctions.length === 0 && (
          <EmptyState title={EMPTY_COPY[activeTab].title} description={EMPTY_COPY[activeTab].description} />
        )}

        {state.status === 'loaded' && activeAuctions.length > 0 && (
          <ResponsiveGrid>
            {activeAuctions.map((auction) => (
              <AuctionCard
                key={auction.id}
                auction={auction}
                artwork={artworks[auction.artworkId] ?? null}
                artistDisplayName={artistNames[auction.sellerId]}
              />
            ))}
          </ResponsiveGrid>
        )}

        {/* Honest "not connected yet" AI entry points, as polished
            horizontal feature cards (visual-matching pass) — same
            convention as HomePage's own AI benefit tile and
            ArtworkDetailPage's AI modal, never a working assistant or
            fabricated recommendation. */}
        {/* Plain, fully self-contained divs rather than the shared Card
            component — these need a purple-tinted gradient border/
            background the base Card's own opaque bg-surface/border-border
            would otherwise have to fight at equal specificity. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl border border-brand-primary/25 bg-gradient-to-br from-brand-primary/10 to-transparent p-4 shadow-card sm:p-5">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-primary/20 text-brand-primary-on-dark">
              <Sparkles aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <p className="font-medium text-text-primary">Curated with AI</p>
              <p className="text-xs text-text-secondary sm:text-sm">AI-curated auction picks aren't connected yet.</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-primary/25 bg-gradient-to-br from-brand-primary/10 to-transparent p-4 shadow-card sm:p-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-primary/20 text-brand-primary-on-dark">
                <Sparkles aria-hidden="true" className="h-5 w-5" />
              </span>
              <p className="font-medium text-text-primary">Ask ArtVault AI</p>
            </div>
            <Button type="button" variant="primary" size="sm" onClick={() => setAiModalOpen(true)}>
              Ask
            </Button>
          </div>
        </div>

        <Modal open={aiModalOpen} onClose={() => setAiModalOpen(false)} title="Ask ArtVault AI">
          <p className="text-sm text-text-secondary">
            AI-powered auction insights aren't connected yet. Once available, this will surface real, curated picks —
            never a fabricated recommendation.
          </p>
        </Modal>
      </section>
    </Container>
  )
}
