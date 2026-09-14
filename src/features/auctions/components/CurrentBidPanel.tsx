import { Trophy } from 'lucide-react'
import { useAuth } from '@/app/providers/AuthProvider'
import { Badge, Button, Card } from '@/shared/ui'
import { AuctionCountdownBoxes } from './AuctionCountdownBoxes'
import { deriveAuctionStatus, minimumNextBid, type Auction } from '../types'

function formatAmount(amount: number): string {
  return `₹${(amount / 100).toFixed(0)}`
}

/**
 * Current highest bid, minimum next bid, and the bid-placement control —
 * all real, live data read straight off the auction document. Bid
 * placement itself is honestly disabled: no trusted server-side bid
 * operation exists yet (see docs/AUCTION_ARCHITECTURE.md — a real bid must
 * be placed inside a Firestore transaction that re-validates `startAt <=
 * now <= endAt` and the bid amount server-side, which nothing in this
 * codebase implements yet), so the input/button render but never submit
 * anything, with a clear, honest "not connected yet" message instead of a
 * silently-fake success. For an ENDED auction, shows the real winner if
 * one was ever recorded (`Auction.winnerUid`/`winningBidAmount` — only a
 * future trusted finalize operation ever sets these) or an honest "no
 * winning bid was recorded" message when they're still null, which is the
 * genuine state of every auction today.
 */
export function CurrentBidPanel({ auction }: { auction: Auction }) {
  const { user } = useAuth()
  const status = deriveAuctionStatus(auction)
  const nextBid = minimumNextBid(auction)
  const isWinner = status === 'ENDED' && auction.winnerUid != null && user?.uid === auction.winnerUid

  return (
    // A gold-tinted background wash (visual-matching pass) — `bg-gradient-
    // to-b` sets `background-image`, a different CSS property from Card's
    // own `bg-surface` (`background-color`), so it layers on top rather
    // than fighting Card's default at equal specificity (unlike a second
    // `border-*`/`bg-{color}` utility would). This is the one panel a
    // bidder's eye should land on first, so it gets a visibly "active"
    // treatment instead of sitting flush with every other neutral Card.
    <Card className="flex flex-col gap-4 bg-gradient-to-b from-accent-gold/10 to-transparent p-4 sm:p-5">
      {status === 'ENDED' ? (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-medium text-text-primary">Auction ended</h2>
          {isWinner && (
            <div className="flex items-center gap-2 rounded-md border border-accent-gold/40 bg-accent-gold/10 p-3">
              <Trophy aria-hidden="true" className="h-5 w-5 text-accent-gold" />
              <p className="text-sm font-medium text-text-primary">You won this auction!</p>
            </div>
          )}
          {auction.winnerUid && auction.winningBidAmount != null ? (
            <p className="text-sm text-text-secondary">
              Winning bid: <span className="font-medium text-text-primary">{formatAmount(auction.winningBidAmount)}</span>
            </p>
          ) : (
            <p className="text-sm text-text-muted">No winning bid was recorded for this auction.</p>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium tracking-wide text-text-muted uppercase">
                {auction.currentHighBid == null ? 'Starting bid' : 'Current bid'}
              </p>
              <p className="font-display text-3xl font-semibold text-accent-gold sm:text-4xl">
                {formatAmount(auction.currentHighBid ?? auction.startingBid)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-muted">Total bids</p>
              <p className="text-lg font-medium text-text-primary">{auction.bidCount}</p>
            </div>
          </div>

          <AuctionCountdownBoxes auction={auction} size="sm" />

          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <p className="text-xs text-text-muted">Minimum next bid: {formatAmount(nextBid)}</p>

            {/* Quick-bid presets — real amounts (minimum next bid, plus one
                and two more increments), same as the manual custom input
                below: cosmetic conveniences over the same disabled action,
                never a shortcut that actually submits anything. */}
            <div className="flex flex-wrap gap-2">
              {[nextBid, nextBid + auction.bidIncrement, nextBid + auction.bidIncrement * 2].map((amount) => (
                <Button key={amount} type="button" variant="secondary" size="sm" disabled>
                  {formatAmount(amount)}
                </Button>
              ))}
            </div>

            <div className="flex gap-2">
              <label className="sr-only" htmlFor="auction-bid-amount">
                Bid amount
              </label>
              <input
                id="auction-bid-amount"
                type="number"
                disabled
                placeholder={formatAmount(nextBid)}
                aria-describedby="auction-bidding-disabled-note"
                className="h-11 w-full rounded-md border border-border-strong bg-surface-elevated px-3 text-sm text-text-secondary placeholder:text-text-secondary disabled:cursor-not-allowed"
              />
              <Button type="button" variant="gold" disabled>
                Place Bid
              </Button>
            </div>
            <p id="auction-bidding-disabled-note" className="text-xs text-text-muted">
              Bidding isn't connected yet — this auction is part of the UI foundation only.
            </p>
            {status === 'SCHEDULED' && <Badge tone="neutral">Bidding opens when this auction goes live</Badge>}
          </div>
        </>
      )}
    </Card>
  )
}
