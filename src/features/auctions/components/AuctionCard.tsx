import { Box, ImageOff, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Card } from '@/shared/ui'
import type { Artwork } from '@/features/artwork'
import { WishlistButton } from '@/features/wishlist/components/WishlistButton'
import { AuctionCountdown } from './AuctionCountdown'
import { AuctionStatusBadge } from './AuctionStatusBadge'
import { deriveAuctionStatus, minimumNextBid, type Auction } from '../types'

/**
 * One auction tile for the AuctionsPage grid — mirrors PublicArtworkCard's
 * shape/spacing so an auction reads as a natural sibling of a regular
 * artwork card, but links into `/auctions/:id` (the auction) rather than
 * the artwork's own page directly, and shows real bid/timing data instead
 * of a plain price. `artwork` is `null` when the linked artwork can't be
 * resolved (deleted/unavailable) — the card still renders honestly with a
 * generic placeholder rather than being skipped, since the auction itself
 * is still real.
 *
 * The AR/AI badges reuse the exact same honest "coming soon" convention
 * PublicArtworkCard already established (inert, `aria-disabled`, a
 * tooltip) — never a working link to a feature that doesn't exist.
 * WishlistButton is genuinely real/connected: an auction's linked artwork
 * is a normal artwork, so saving it to the wishlist behaves identically to
 * saving it from Explore.
 */
export function AuctionCard({
  auction,
  artwork,
  artistDisplayName,
}: {
  auction: Auction
  artwork: Artwork | null
  artistDisplayName?: string | null
}) {
  const cover = artwork?.images[0]
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = cover && !imageFailed
  const status = deriveAuctionStatus(auction)
  const href = `/auctions/${auction.id}`
  const bidLabel = auction.currentHighBid == null ? 'Starting bid' : 'Current bid'
  const bidAmount = auction.currentHighBid ?? minimumNextBid(auction)

  return (
    <Card className="group flex flex-col gap-0 overflow-hidden p-0 shadow-card transition-all duration-200 ease-standard hover:-translate-y-0.5 hover:border-accent-gold/50 hover:shadow-elevated">
      <Link to={href} className="relative flex aspect-[4/5] items-center justify-center overflow-hidden bg-surface-elevated">
        {showImage ? (
          <img
            src={cover.url}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300 ease-standard motion-safe:group-hover:scale-105"
          />
        ) : (
          <ImageOff aria-hidden="true" className="h-8 w-8 text-text-muted" />
        )}
        <div className="absolute top-2 left-2">
          <AuctionStatusBadge status={status} />
        </div>
        {artwork && <WishlistButton artworkId={artwork.id} className="absolute top-2 right-2 h-8 w-8" />}
      </Link>
      <div className="flex flex-col gap-1 p-2.5 sm:p-3.5">
        <Link to={href}>
          <h3 className="font-display truncate text-sm font-medium text-text-primary hover:underline sm:text-base">
            {artwork?.title ?? 'Artwork unavailable'}
          </h3>
        </Link>
        {artistDisplayName && <p className="truncate text-xs text-text-muted">{artistDisplayName}</p>}
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] text-text-muted">{bidLabel}</p>
            <p className="font-display text-base font-medium text-accent-gold sm:text-lg">₹{(bidAmount / 100).toFixed(0)}</p>
          </div>
        </div>
        <AuctionCountdown auction={auction} />
        <div className="mt-1 flex gap-1.5">
          <span
            role="img"
            aria-label="AR preview unavailable"
            title="AR preview unavailable"
            className="inline-flex h-6 items-center gap-1 rounded-full bg-blue-600/15 px-2 text-[10px] font-medium text-blue-400 opacity-80"
          >
            <Box aria-hidden="true" className="h-3 w-3" /> AR
          </span>
          <span
            role="button"
            aria-disabled="true"
            title="AI Artwork Analysis — coming soon"
            className="inline-flex h-6 items-center gap-1 rounded-full bg-brand-primary/15 px-2 text-[10px] font-medium text-brand-primary-on-dark opacity-80"
          >
            <Sparkles aria-hidden="true" className="h-3 w-3" /> AI
          </span>
        </div>
      </div>
    </Card>
  )
}
