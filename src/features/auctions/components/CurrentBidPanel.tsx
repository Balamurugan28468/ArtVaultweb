import { useState } from 'react'
import { AlertCircle, CheckCircle, Loader2, Trophy } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
import { Badge, Button, Card } from '@/shared/ui'
import { createAuctionWinnerOrder, placeBid } from '../api/auctionsRepository'
import { AuctionCountdownBoxes } from './AuctionCountdownBoxes'
import { deriveAuctionStatus, minimumNextBid, type Auction } from '../types'

function formatAmount(amount: number): string {
  return `₹${Math.round(amount / 100).toLocaleString('en-IN')}`
}

interface CurrentBidPanelProps {
  auction: Auction
  onBidPlaced?: () => void
  hideCountdown?: boolean
}

export function CurrentBidPanel({ auction, onBidPlaced, hideCountdown }: CurrentBidPanelProps) {
  const { user } = useAuth()
  const status = deriveAuctionStatus(auction)
  const nextBid = minimumNextBid(auction)
  const isWinner =
    (status === 'ENDED' || auction.lotStatus === 'WINNER_PENDING') &&
    auction.winnerUid != null &&
    user?.uid === auction.winnerUid
  const isSeller = user?.uid != null && user.uid === auction.sellerId

  const [bidAmount, setBidAmount] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [settling, setSettling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handlePlaceBid = async (amountToPlace: number) => {
    if (!auction.auctionItemId && !auction.id) return
    const lotId = auction.auctionItemId ?? auction.id
    setError(null)
    setSuccessMessage(null)

    if (amountToPlace < nextBid) {
      setError(`Minimum bid is ${formatAmount(nextBid)}`)
      return
    }

    setSubmitting(true)
    try {
      const result = await placeBid(lotId, amountToPlace)
      if (result.success) {
        setSuccessMessage(`Successfully placed bid of ${formatAmount(amountToPlace)}!`)
        setBidAmount('')
        onBidPlaced?.()
      } else {
        switch (result.error) {
          case 'bid_too_low':
            setError(`A higher bid was placed. Minimum next bid is ${formatAmount(nextBid)}.`)
            break
          case 'seller_cannot_bid':
            setError('Sellers cannot place bids on their own artwork.')
            break
          case 'auction_not_live':
            setError('This auction is not currently live for bidding.')
            break
          case 'lot_not_open':
            setError('This auction lot is currently closed.')
            break
          case 'duplicate_key':
            setError('This bid has already been submitted.')
            break
          default:
            setError(`Could not place bid: ${result.error}`)
            break
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place bid. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleWinnerCheckout = async () => {
    const lotId = auction.auctionItemId ?? auction.id
    setSettling(true)
    setError(null)
    try {
      const orderId = await createAuctionWinnerOrder(lotId)
      if (typeof window !== 'undefined') {
        window.location.assign(`/checkout?orderId=${orderId}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create winner order. Please try again.')
      setSettling(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4 bg-gradient-to-b from-accent-gold/10 to-transparent p-4 sm:p-5">
      {status === 'ENDED' || auction.lotStatus === 'WINNER_PENDING' || auction.lotStatus === 'SETTLED' ? (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-medium text-text-primary">Auction ended</h2>

          {isWinner && (
            <div className="flex flex-col gap-2 rounded-md border border-accent-gold/40 bg-accent-gold/10 p-3">
              <div className="flex items-center gap-2">
                <Trophy aria-hidden="true" className="h-5 w-5 text-accent-gold" />
                <p className="text-sm font-medium text-text-primary">You won this auction!</p>
              </div>
              {auction.lotStatus === 'WINNER_PENDING' && (
                <div className="mt-1 flex flex-col gap-2">
                  <p className="text-xs text-text-secondary">
                    Please complete payment within the payment window to secure this artwork.
                  </p>
                  <Button
                    type="button"
                    variant="gold"
                    size="sm"
                    disabled={settling}
                    onClick={handleWinnerCheckout}
                  >
                    {settling ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing Checkout...
                      </>
                    ) : (
                      'Proceed to Winner Checkout →'
                    )}
                  </Button>
                </div>
              )}
              {auction.lotStatus === 'SETTLED' && (
                <p className="text-xs font-medium text-emerald-400">
                  Payment completed. Your order has been placed!
                </p>
              )}
            </div>
          )}

          {auction.winnerUid && auction.winningBidAmount != null ? (
            <p className="text-sm text-text-secondary">
              Winning bid: <span className="font-medium text-text-primary">{formatAmount(auction.winningBidAmount)}</span>
            </p>
          ) : (
            <p className="text-sm text-text-muted">No winning bid was recorded for this auction.</p>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded bg-red-500/10 p-2 text-xs text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
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

          {!hideCountdown && <AuctionCountdownBoxes auction={auction} size="sm" />}

          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <p className="text-xs text-text-muted">Minimum next bid: {formatAmount(nextBid)}</p>

            {!auction.auctionItemId ? (
              <>
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
              </>
            ) : status === 'LIVE' ? (
              isSeller ? (
                <div className="rounded-md border border-border bg-surface-elevated p-3 text-xs text-text-secondary">
                  You are the seller of this artwork. Sellers are not permitted to bid on their own listings.
                </div>
              ) : !user ? (
                <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-elevated p-3 text-center">
                  <p className="text-xs text-text-secondary">Sign in to participate in live bidding</p>
                  <Link to="/sign-in" className="inline-flex justify-center">
                    <Button type="button" variant="secondary" size="sm">
                      Sign In to Bid
                    </Button>
                  </Link>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {[nextBid, nextBid + auction.bidIncrement, nextBid + auction.bidIncrement * 2].map((amount) => (
                      <Button
                        key={amount}
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={submitting}
                        onClick={() => handlePlaceBid(amount)}
                      >
                        {formatAmount(amount)}
                      </Button>
                    ))}
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const val = Number(bidAmount)
                      if (!isNaN(val) && val > 0) {
                        handlePlaceBid(val * 100)
                      }
                    }}
                    className="flex gap-2"
                  >
                    <label className="sr-only" htmlFor="auction-bid-amount">
                      Bid amount in rupees
                    </label>
                    <input
                      id="auction-bid-amount"
                      type="number"
                      step="any"
                      min={nextBid / 100}
                      disabled={submitting}
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      placeholder={`Min ₹${(nextBid / 100).toFixed(0)}`}
                      className="h-11 w-full rounded-md border border-border-strong bg-surface-elevated px-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-gold focus:outline-none disabled:cursor-not-allowed"
                    />
                    <Button
                      type="submit"
                      variant="gold"
                      disabled={submitting || !bidAmount || Number(bidAmount) * 100 < nextBid}
                    >
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Place Bid'}
                    </Button>
                  </form>

                  {error && (
                    <div className="flex items-center gap-1.5 text-xs text-red-400">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {successMessage && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{successMessage}</span>
                    </div>
                  )}
                </>
              )
            ) : (
              <Badge tone="neutral">Bidding opens when this auction goes live</Badge>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
