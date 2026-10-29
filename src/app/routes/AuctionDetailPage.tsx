import { Box, Crown, Sparkles, Trophy } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useArtistProfile } from '@/features/artist-profile'
import { ArtworkGallery } from '@/features/artwork'
import {
  AuctionCountdown,
  AuctionCountdownBoxes,
  AuctionStatusBadge,
  BidHistoryPanel,
  CurrentBidPanel,
  deriveAuctionStatus,
  fetchAuctionBidHistory,
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
  return `₹${Math.round(amount / 100).toLocaleString('en-IN')}`
}

const STATUS_LABEL: Record<ReturnType<typeof deriveAuctionStatus>, string> = {
  SCHEDULED: 'Upcoming',
  LIVE: 'Live',
  ENDED: 'Ended',
}

const BIDDER_AVATAR_COLORS = [
  'bg-purple-600/30 text-purple-300',
  'bg-pink-600/30 text-pink-300',
  'bg-red-600/30 text-red-300',
  'bg-emerald-600/30 text-emerald-300',
  'bg-cyan-600/30 text-cyan-300',
]

/**
 * Shows the current highest bidder with avatar initials, name, and the
 * amount they are leading by. Data comes from real bid history (same RPC
 * as BidHistoryPanel) — bids[0] is highest because the RPC returns bids
 * ordered DESC by amount. Renders nothing (null) if no bids exist or
 * while loading, so it never fabricates a placeholder bidder.
 */
function HighestBidderRow({ auctionItemId }: { auctionItemId?: string }) {
  const [topBidder, setTopBidder] = useState<{ name: string; amount: number; leadingBy: number } | null>(null)

  useEffect(() => {
    if (!auctionItemId) return
    let active = true
    void (async () => {
      try {
        const history = await fetchAuctionBidHistory(auctionItemId)
        if (!active || history.length === 0) return
        const top = history[0]
        const second = history[1]
        const name = top.bidderName ?? 'Anonymous Bidder'
        const leadingBy = second ? top.amountMinor - second.amountMinor : 0
        setTopBidder({ name, amount: top.amountMinor, leadingBy })
      } catch {
        // silent fallback — panel simply doesn't render
      }
    })()
    return () => { active = false }
  }, [auctionItemId])

  if (!topBidder) return null

  const parts = topBidder.name.trim().split(/\s+/)
  const initials = (parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : topBidder.name.slice(0, 2)).toUpperCase()

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-2 text-[11px] font-semibold tracking-wide text-text-muted uppercase">Highest Bidder</p>
      <div className="flex items-center justify-between rounded-lg border border-accent-gold/20 bg-accent-gold/5 px-3 py-2">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${BIDDER_AVATAR_COLORS[0]}`}>
            {initials}
          </span>
          <div>
            <p className="text-xs font-semibold text-text-primary">{topBidder.name}</p>
            {topBidder.leadingBy > 0 && (
              <p className="text-[10px] text-text-muted">
                Leading by ₹{Math.round(topBidder.leadingBy / 100).toLocaleString('en-IN')}
              </p>
            )}
          </div>
        </div>
        <Crown aria-label="Current leader" className="h-4 w-4 text-accent-gold" />
      </div>
    </div>
  )
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
  const [searchParams]=useSearchParams()
  const state = useAuction(auctionId,searchParams.get('lot')??undefined)
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
    auctionId && typeof window !== 'undefined' ? `${window.location.origin}/auctions/${auctionId}${state.status==='loaded'&&state.auction.auctionItemId?`?lot=${encodeURIComponent(state.auction.auctionItemId)}`:''}` : ''

  const status = state.status === 'loaded' ? deriveAuctionStatus(state.auction) : null

  return (
    <Container>
      {allAuctionsState.status==='loaded'&&allAuctionsState.auctions.filter(a=>a.id===auctionId).length>1&&
        <nav aria-label="Weekly auction lots" className="mb-4 flex flex-wrap gap-3">
          {allAuctionsState.auctions.filter(a=>a.id===auctionId).map((a,i)=><Link key={a.auctionItemId} className="rounded border border-border px-3 py-2 text-sm"
            to={`/auctions/${auctionId}?lot=${a.auctionItemId}`} aria-current={state.status==='loaded'&&state.auction.auctionItemId===a.auctionItemId?'page':undefined}>Lot {i+1}</Link>)}
        </nav>}
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
                  {(state.auction.winningBidAmount != null) ? 'Congratulations to the winner!' : 'This auction has closed.'}
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
                  {state.artwork && (
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      <span className="rounded bg-surface-elevated px-2 py-0.5 text-text-secondary">
                        {state.artwork.category ?? 'Original'}
                      </span>
                    </div>
                  )}
                </div>

                <CurrentBidPanel auction={state.auction} onBidPlaced={state.reload} />

                <p className="text-sm text-text-secondary">
                  {(state.auction.winningBidAmount != null)
                    ? 'Thank you to everyone who participated! Stay tuned for our next auction.'
                    : 'No winning bid was recorded — stay tuned for the next auction.'}
                </p>

                {/* View Artist Profile + View Certificate — matching reference image */}
                <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                  {artistName && state.artwork && (
                    <Link
                      to={`/artists/${state.artwork.sellerId}`}
                      className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary hover:underline"
                    >
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated text-xs">👤</span>
                      View Artist Profile
                    </Link>
                  )}
                  {/* Certificate of authenticity — a property of the sold artwork, not fabricated data */}
                  <span className="flex items-center gap-2 text-sm text-text-muted">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated text-xs">📜</span>
                    View Certificate
                    <span className="text-xs text-text-muted">(available after payment)</span>
                  </span>
                </div>

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

              {/* RIGHT — Auction Details, Top Bidders, What's Next, Editorial quote */}
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
                    <dd className="text-text-primary">
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">Completed</span>
                    </dd>
                  </dl>
                </Card>

                <TopBiddersPanel auctionItemId={state.auction.auctionItemId} />

                <Card className="flex flex-col gap-2 p-4 sm:p-5">
                  <h2 className="font-display text-base font-medium text-text-primary">What's Next?</h2>
                  <p className="text-sm text-text-secondary">New curated artworks. New stories. New opportunities.</p>
                  <Link to="/auctions" className="inline-flex">
                    <Button type="button" variant="gold" size="sm">
                      View Upcoming Auctions →
                    </Button>
                  </Link>
                </Card>

                {/* Editorial quote — matching reference design 2/4 far-right quote block */}
                <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-surface via-surface to-accent-gold/5 p-5">
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: 'radial-gradient(rgba(255,215,0,0.15) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
                  />
                  <blockquote className="relative flex flex-col gap-2">
                    <span className="font-display text-3xl leading-none text-accent-gold/40" aria-hidden="true">"</span>
                    <p className="font-display text-sm italic leading-relaxed text-text-primary">
                      Every artwork finds its home.
                    </p>
                    <footer className="text-xs text-text-muted">— ArtVault</footer>
                  </blockquote>
                </div>
              </div>
            </div>
          </>
        )}


        {/* ============================== UPCOMING / LIVE ============================== */}
        {state.status === 'loaded' && status !== 'ENDED' && (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <AuctionStatusBadge status={status!} />
                <span className="text-xs font-semibold tracking-wide text-text-muted uppercase">
                  Weekly Auction – Featured Artwork
                </span>
              </div>
              <PageHeader
                title={state.artwork?.title ?? 'Artwork unavailable'}
                description="Place your bids in real time. Highest bid wins!"
              />
              <AuctionCountdown auction={state.auction} />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_22rem] xl:items-start xl:gap-6">
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

              {/* CENTER — artist/description/likes/share & CurrentBidPanel */}
              <div className="flex flex-col gap-4">
                <Card className="flex flex-col gap-3 p-4 sm:p-5">
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <span className="rounded bg-surface-elevated px-2 py-0.5 font-medium text-text-secondary">Original</span>
                    {state.artwork?.createdAt?.toDate && (
                      <span className="rounded bg-surface-elevated px-2 py-0.5 text-text-secondary">
                        {state.artwork.createdAt.toDate().getFullYear()}
                      </span>
                    )}
                    {state.artwork?.category && (
                      <span className="rounded bg-surface-elevated px-2 py-0.5 text-text-secondary capitalize">
                        {state.artwork.category}
                      </span>
                    )}
                    {state.artwork?.tags?.map((tag) => (
                      <span key={tag} className="rounded bg-surface-elevated px-2 py-0.5 text-text-muted">
                        #{tag}
                      </span>
                    ))}
                  </div>

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

                <CurrentBidPanel auction={state.auction} onBidPlaced={state.reload} hideCountdown />
              </div>

              {/* RIGHT — countdown box & live bidding feed */}
              <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold tracking-wide text-text-muted uppercase">
                      {status === 'SCHEDULED' ? 'Auction Starts In' : 'Auction Ends In'}
                    </p>
                    {status === 'LIVE' && (
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-red-500">
                        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        Live Auction
                      </span>
                    )}
                  </div>
                  <AuctionCountdownBoxes auction={state.auction} size="sm" />

                  {/* Auction stats summary — Starting Price / Current Bid / Bid Increment / Total Bids */}
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border pt-3 text-xs">
                    <dt className="text-text-muted">Starting Price</dt>
                    <dd className="text-right font-medium text-text-primary">
                      {formatAmount(state.auction.startingBid)}
                    </dd>
                    <dt className="text-text-muted">Current Bid</dt>
                    <dd className="text-right font-semibold text-accent-gold">
                      {formatAmount(state.auction.currentHighBid ?? state.auction.startingBid)}
                    </dd>
                    <dt className="text-text-muted">Bid Increment</dt>
                    <dd className="text-right font-medium text-text-primary">
                      {formatAmount(state.auction.bidIncrement)}
                    </dd>
                    <dt className="text-text-muted">Total Bids</dt>
                    <dd className="text-right font-medium text-text-primary">{state.auction.bidCount}</dd>
                  </dl>

                  {/* Highest Bidder — from real bid history top entry; shows nothing if no bids yet */}
                  {state.auction.currentHighBid != null && (
                    <HighestBidderRow auctionItemId={state.auction.auctionItemId} />
                  )}
                </div>

                <BidHistoryPanel
                  status={status!}
                  auctionItemId={state.auction.auctionItemId}
                  likeCount={state.artwork?.likeCount}
                  onShare={() => {
                    if (navigator.share && canonicalUrl) {
                      void navigator.share({ title: state.artwork?.title, url: canonicalUrl })
                    } else if (canonicalUrl) {
                      void navigator.clipboard.writeText(canonicalUrl)
                    }
                  }}
                />
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
              <BidHistoryPanel status={status!} auctionItemId={state.auction.auctionItemId} />
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

        {/* Floating ArtVault AI action pill matching reference designs */}
        <div className="fixed bottom-6 right-6 z-30">
          <button
            type="button"
            onClick={() => setAiModalOpen(true)}
            className="group flex items-center gap-2.5 rounded-full border border-brand-primary/40 bg-surface-elevated/95 px-4 py-2.5 shadow-elevated backdrop-blur-md transition-all hover:scale-105 hover:border-brand-primary active:scale-95"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="text-left text-xs">
              <div className="font-semibold text-text-primary">Ask ArtVault AI</div>
              <div className="text-[10px] text-text-muted">
                {status === 'ENDED' ? 'Find similar artworks' : 'Ask about this artwork'}
              </div>
            </div>
          </button>
        </div>

        <Modal open={arModalOpen} onClose={() => setArModalOpen(false)} title="About AR preview">
          <p className="text-sm text-text-secondary">
            AR preview is unavailable. Camera placement and true-scale viewing are not available yet.
          </p>
        </Modal>
        <Modal open={aiModalOpen} onClose={() => setAiModalOpen(false)} title="ArtVault AI (Coming in Module 6 & 7)">
          <p className="text-sm text-text-secondary">
            AI-powered analysis and auction assistant capabilities are not active yet. AI selection will be introduced in Module 6, and the ArtVault AI Assistant in Module 7 — never generating fabricated insights.
          </p>
        </Modal>
      </section>
    </Container>
  )
}
