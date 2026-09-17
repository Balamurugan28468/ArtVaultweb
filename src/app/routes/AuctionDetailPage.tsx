import { Box, Sparkles, Trophy } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useArtistProfile } from '@/features/artist-profile'
import { ArtworkGallery } from '@/features/artwork'
import {
  AuctionCountdown,
  AuctionStatusBadge,
  BidHistoryPanel,
  CurrentBidPanel,
  deriveAuctionStatus,
  TopBiddersPanel,
  useAuction,
  useAuctions,
} from '@/features/auctions'
import { LikeButton } from '@/features/likes'
import { useArtistDisplayNames } from '@/features/marketplace'
import { WishlistButton } from '@/features/wishlist'
import { Avatar, Button, Card, Container, EmptyState, ErrorState, Modal, PageHeader, ShareButton, Skeleton } from '@/shared/ui'

type DetailTab = 'details' | 'bidding-history' | 'artist-info' | 'shipping' | 'faqs'
const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'bidding-history', label: 'Bidding History' },
  { id: 'artist-info', label: 'Artist Info' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'faqs', label: 'FAQs' },
]

function formatDate(value: { toDate?: () => Date } | undefined): string {
  const date = value?.toDate?.()
  if (!date) return '—'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatAmount(amount: number): string {
  return `₹${(amount / 100).toFixed(0)}`
}

const STATUS_LABEL: Record<ReturnType<typeof deriveAuctionStatus>, string> = {
  SCHEDULED: 'Upcoming',
  LIVE: 'Live',
  ENDED: 'Ended',
}

/**
 * UI-04 — a single auction's detail page (visual-matching pass).
 *
 * Mobile order (this component's own literal DOM order — nothing is
 * reordered via CSS): Back link → status/title/countdown → gallery →
 * artwork info (artist/description/likes/share/AR/AI) → bid panel → live
 * bidding/bid history → info tabs → the honest "Ask ArtVault AI" card.
 * The desktop `xl:grid-cols-[...]` wrapper only changes *presentation*
 * into three columns side by side — it never reorders these blocks
 * relative to each other, so the required mobile order falls out
 * naturally. A completed (ENDED) auction renders a genuinely different
 * "result page" composition instead (see the dedicated branch below), not
 * just the same layout with a status label swapped — but follows the same
 * DOM-order-drives-mobile-layout principle.
 *
 * Every real value here (auction timing/bids, the linked artwork, likes,
 * wishlist, winner) is live data. Bidding, bid history, top bidders, AR,
 * and AI all render real controls/panels but stay honestly disabled/not-
 * connected — see CurrentBidPanel/BidHistoryPanel/TopBiddersPanel and this
 * file's own AR/AI modals.
 */
export function AuctionDetailPage() {
  const { auctionId } = useParams()
  const state = useAuction(auctionId)
  const [activeTab, setActiveTab] = useState<DetailTab>('details')
  const [arModalOpen, setArModalOpen] = useState(false)
  const [aiModalOpen, setAiModalOpen] = useState(false)

  const sellerId = state.status === 'loaded' ? state.artwork?.sellerId : undefined
  const artistNames = useArtistDisplayNames(sellerId ? [sellerId] : [])
  const artistName = sellerId ? artistNames[sellerId] : null
  const artistProfileState = useArtistProfile(sellerId)
  const artistBio = artistProfileState.status === 'loaded' ? artistProfileState.profile.bio : null

  // Real "next auction" for the completed-result page's CTA — cheap,
  // bounded (see fetchAllAuctions), never a guess: only ever links to a
  // genuinely SCHEDULED auction, and the CTA itself is omitted entirely
  // (see below) when none exists.
  const allAuctionsState = useAuctions()
  const nextAuctionId =
    allAuctionsState.status === 'loaded'
      ? allAuctionsState.auctions.find((a) => a.id !== auctionId && deriveAuctionStatus(a) === 'SCHEDULED')?.id
      : undefined

  const canonicalUrl =
    auctionId && typeof window !== 'undefined' ? `${window.location.origin}/auctions/${auctionId}` : ''

  const status = state.status === 'loaded' ? deriveAuctionStatus(state.auction) : null

  return (
    <Container>
      <section className="flex flex-col gap-6">
        <Link to="/auctions" className="text-sm text-text-secondary hover:text-text-primary hover:underline">
          ← Back to Auctions
        </Link>

        {state.status === 'loading' && (
          <div aria-busy="true" aria-label="Loading auction" className="flex flex-col gap-3">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-96 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {state.status === 'error' && <ErrorState title="Couldn't load this auction" description={state.error.message} />}

        {state.status === 'missing' && (
          <EmptyState
            title="Auction not found"
            description="This auction doesn't exist, or is no longer available."
            action={
              <Link to="/auctions" className="inline-flex">
                <Button type="button">Back to Auctions</Button>
              </Link>
            }
          />
        )}

        {/* ============================== COMPLETED / ENDED — a dedicated result-page composition, not the live/upcoming layout with a label swapped ============================== */}
        {state.status === 'loaded' && status === 'ENDED' && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <AuctionStatusBadge status="ENDED" />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_20rem] xl:items-start xl:gap-8">
              {/* LEFT — Auction Ended + artwork */}
              <div className="flex flex-col items-center gap-3 text-center xl:items-start xl:text-left">
                <Trophy aria-hidden="true" className="h-10 w-10 text-accent-gold" />
                <h1 className="font-display text-2xl font-medium text-text-primary sm:text-3xl">Auction Ended</h1>
                <p className="text-sm text-text-secondary">
                  {state.auction.winnerUid ? 'Congratulations to the winner!' : 'This auction has closed.'}
                </p>
                {state.artwork ? (
                  <div className="w-full">
                    <ArtworkGallery images={state.artwork.images} title={state.artwork.title} />
                  </div>
                ) : (
                  <div className="flex h-72 w-full items-center justify-center rounded-xl border border-border bg-surface-elevated text-sm text-text-muted">
                    Artwork unavailable
                  </div>
                )}
              </div>

              {/* CENTER — result + CTAs */}
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="font-display text-xl font-medium text-text-primary">{state.artwork?.title ?? 'Artwork unavailable'}</h2>
                  {artistName && <p className="text-sm text-text-secondary">by {artistName}</p>}
                </div>

                <CurrentBidPanel auction={state.auction} />

                <p className="text-sm text-text-secondary">
                  {state.auction.winnerUid
                    ? 'Thank you to everyone who participated! Stay tuned for our next auction.'
                    : 'No winning bid was recorded — stay tuned for the next auction.'}
                </p>

                <div className="flex flex-wrap gap-2">
                  {nextAuctionId && (
                    <Link to={`/auctions/${nextAuctionId}`} className="inline-flex">
                      <Button type="button" variant="gold">
                        View Next Auction →
                      </Button>
                    </Link>
                  )}
                  <Link to="/explore" className="inline-flex">
                    <Button type="button" variant="secondary">
                      Explore More Artworks
                    </Button>
                  </Link>
                </div>
              </div>

              {/* RIGHT — Auction Details, Top Bidders, What's Next */}
              <div className="flex flex-col gap-4">
                <Card className="flex flex-col gap-3 p-4 sm:p-5">
                  <h2 className="font-display text-base font-medium text-text-primary">Auction Details</h2>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <dt className="text-text-muted">Start Date</dt>
                    <dd className="text-text-primary">{formatDate(state.auction.startAt)}</dd>
                    <dt className="text-text-muted">End Date</dt>
                    <dd className="text-text-primary">{formatDate(state.auction.endAt)}</dd>
                    <dt className="text-text-muted">Total Bids</dt>
                    <dd className="text-text-primary">{state.auction.bidCount}</dd>
                    <dt className="text-text-muted">Starting Bid</dt>
                    <dd className="text-text-primary">{formatAmount(state.auction.startingBid)}</dd>
                    <dt className="text-text-muted">Final Bid</dt>
                    <dd className="text-text-primary">
                      {state.auction.winningBidAmount != null ? formatAmount(state.auction.winningBidAmount) : 'Not recorded'}
                    </dd>
                    <dt className="text-text-muted">Bid Increment</dt>
                    <dd className="text-text-primary">{formatAmount(state.auction.bidIncrement)}</dd>
                    <dt className="text-text-muted">Status</dt>
                    <dd className="text-text-primary">Completed</dd>
                  </dl>
                  {artistName && state.artwork && (
                    <Link to={`/artists/${state.artwork.sellerId}`} className="text-sm text-brand-primary-on-dark hover:underline">
                      View Artist Profile →
                    </Link>
                  )}
                </Card>

                <TopBiddersPanel />

                <Card className="flex flex-col gap-2 p-4 sm:p-5">
                  <h2 className="font-display text-base font-medium text-text-primary">What's Next?</h2>
                  <p className="text-sm text-text-secondary">New curated artworks. New stories. New opportunities.</p>
                  <Link to="/auctions" className="text-sm font-medium text-accent-gold hover:underline">
                    View Upcoming Auctions →
                  </Link>
                </Card>
              </div>
            </div>
          </>
        )}

        {/* ============================== UPCOMING / LIVE ============================== */}
        {state.status === 'loaded' && status !== 'ENDED' && (
          <>
            <div className="flex flex-col gap-2">
              <AuctionStatusBadge status={status!} />
              <PageHeader title={state.artwork?.title ?? 'Artwork unavailable'} />
              <AuctionCountdown auction={state.auction} />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_20rem] xl:items-start xl:gap-6">
              {/* LEFT — gallery + AR/AI shortcuts */}
              <div className="flex flex-col gap-3">
                {state.artwork ? (
                  <ArtworkGallery images={state.artwork.images} title={state.artwork.title} />
                ) : (
                  <div className="flex h-72 items-center justify-center rounded-xl border border-border bg-surface-elevated text-sm text-text-muted">
                    Artwork unavailable
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="info" size="sm" onClick={() => setArModalOpen(true)}>
                    <Box aria-hidden="true" className="h-4 w-4" /> About AR preview
                  </Button>
                  <Button type="button" variant="primary" size="sm" onClick={() => setAiModalOpen(true)}>
                    <Sparkles aria-hidden="true" className="h-4 w-4" /> AI Analysis
                  </Button>
                </div>
              </div>

              {/* CENTER — artist/description/likes/share */}
              <Card className="flex flex-col gap-3 p-4 sm:p-5">
                {state.artwork && artistName && (
                  <Link to={`/artists/${state.artwork.sellerId}`} className="group flex w-fit items-center gap-2">
                    <Avatar name={artistName} size="sm" />
                    <span className="text-sm text-text-secondary group-hover:text-text-primary group-hover:underline">
                      by {artistName}
                    </span>
                  </Link>
                )}
                {state.artwork && <p className="text-sm text-text-secondary">{state.artwork.description}</p>}

                {state.artwork && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <WishlistButton artworkId={state.artwork.id} />
                    <LikeButton artworkId={state.artwork.id} likeCount={state.artwork.likeCount} />
                    <ShareButton url={canonicalUrl} title={state.artwork.title} text={`${state.artwork.title} on ArtVault`} />
                  </div>
                )}

                <Link to={`/artworks/${state.auction.artworkId}`} className="text-xs text-text-muted hover:text-text-secondary hover:underline">
                  View full artwork listing →
                </Link>
              </Card>

              {/* RIGHT — bid info/controls, then live bidding/bid history */}
              <div className="flex flex-col gap-4">
                <CurrentBidPanel auction={state.auction} />
                <BidHistoryPanel status={status!} />
              </div>
            </div>
          </>
        )}

        {/* Info tabs — shared by every status, integrated into one card. */}
        {state.status === 'loaded' && (
          <Card className="flex flex-col gap-4 p-4 sm:p-5">
            <div role="tablist" aria-label="Auction information" className="flex gap-1 overflow-x-auto border-b border-border">
              {DETAIL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`auction-tab-${tab.id}`}
                  aria-selected={activeTab === tab.id}
                  aria-controls={`auction-panel-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`shrink-0 border-b-[3px] px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-150 ease-standard ${
                    activeTab === tab.id
                      ? 'border-accent-gold text-text-primary'
                      : 'border-transparent text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div role="tabpanel" id="auction-panel-details" aria-labelledby="auction-tab-details" hidden={activeTab !== 'details'}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <dt className="text-text-muted">Start</dt>
                <dd className="text-text-primary">{formatDate(state.auction.startAt)}</dd>
                <dt className="text-text-muted">End</dt>
                <dd className="text-text-primary">{formatDate(state.auction.endAt)}</dd>
                <dt className="text-text-muted">Starting bid</dt>
                <dd className="text-text-primary">{formatAmount(state.auction.startingBid)}</dd>
                <dt className="text-text-muted">Bid increment</dt>
                <dd className="text-text-primary">{formatAmount(state.auction.bidIncrement)}</dd>
                <dt className="text-text-muted">Total bids</dt>
                <dd className="text-text-primary">{state.auction.bidCount}</dd>
                <dt className="text-text-muted">Final bid</dt>
                <dd className="text-text-primary">
                  {state.auction.winningBidAmount != null ? formatAmount(state.auction.winningBidAmount) : 'Not yet finalized'}
                </dd>
                <dt className="text-text-muted">Status</dt>
                <dd className="text-text-primary">{STATUS_LABEL[status!]}</dd>
              </dl>
            </div>

            <div role="tabpanel" id="auction-panel-bidding-history" aria-labelledby="auction-tab-bidding-history" hidden={activeTab !== 'bidding-history'}>
              <BidHistoryPanel status={status!} />
            </div>

            <div role="tabpanel" id="auction-panel-artist-info" aria-labelledby="auction-tab-artist-info" hidden={activeTab !== 'artist-info'}>
              {state.artwork && artistName ? (
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar name={artistName} size="md" />
                    <div className="flex flex-col gap-0.5">
                      <p className="font-medium text-text-primary">{artistName}</p>
                      {artistBio && <p className="max-w-md text-sm text-text-secondary">{artistBio}</p>}
                    </div>
                  </div>
                  <Link to={`/artists/${state.artwork.sellerId}`} className="text-sm font-medium text-brand-primary-on-dark hover:underline">
                    View full profile →
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-text-muted">Artist information is unavailable for this auction.</p>
              )}
            </div>

            <div role="tabpanel" id="auction-panel-shipping" aria-labelledby="auction-tab-shipping" hidden={activeTab !== 'shipping'}>
              <p className="text-sm text-text-secondary">
                Shipping and returns aren't connected yet — checkout, delivery, and return policies are coming in a
                later module.
              </p>
            </div>

            <div role="tabpanel" id="auction-panel-faqs" aria-labelledby="auction-tab-faqs" hidden={activeTab !== 'faqs'}>
              <dl className="flex flex-col gap-4 text-sm">
                <div>
                  <dt className="font-medium text-text-primary">How does bidding work?</dt>
                  <dd className="text-text-secondary">
                    Once bidding is connected, each bid must meet the minimum next bid shown above. The highest bid
                    when the auction ends wins.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-text-primary">Can I bid right now?</dt>
                  <dd className="text-text-secondary">Not yet — see the note under the bid form above.</dd>
                </div>
                <div>
                  <dt className="font-medium text-text-primary">What happens when an auction ends?</dt>
                  <dd className="text-text-secondary">
                    The highest real bid, once bidding exists, will be recorded as the winner here — never a
                    fabricated result.
                  </dd>
                </div>
              </dl>
            </div>
          </Card>
        )}

        {/* AI helper — same honest "not connected yet" entry point as everywhere else in ArtVault, never a working assistant. */}
        {state.status === 'loaded' && (
          <Card className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary/15 text-brand-primary-on-dark">
                <Sparkles aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <p className="font-medium text-text-primary">Ask ArtVault AI</p>
                <p className="text-sm text-text-secondary">Get AI-powered insights about this auction's artwork.</p>
              </div>
            </div>
            <Button type="button" variant="primary" size="sm" onClick={() => setAiModalOpen(true)}>
              Ask ArtVault AI
            </Button>
          </Card>
        )}

        <Modal open={arModalOpen} onClose={() => setArModalOpen(false)} title="About AR preview">
          <p className="text-sm text-text-secondary">
            AR preview is unavailable. Camera placement and true-scale viewing are not available yet.
          </p>
        </Modal>
        <Modal open={aiModalOpen} onClose={() => setAiModalOpen(false)} title="Ask ArtVault AI">
          <p className="text-sm text-text-secondary">
            AI-powered analysis and auction insights aren't connected yet. Once available, this will surface real
            insights about this artwork and auction — never a fabricated result.
          </p>
        </Modal>
      </section>
    </Container>
  )
}
