import { useEffect, useState } from 'react'
import { Gavel, Loader2 } from 'lucide-react'
import { Link } from 'react-router'
import { Badge, type BadgeTone, Button, Card } from '@/shared/ui'
import { fetchSellerAuctionItems } from '../api/auctionsRepository'
import type { AuctionLotStatus, SellerAuctionItem } from '../types'

function formatAmount(amount: number): string {
  return `₹${(amount / 100).toFixed(0)}`
}

function formatDate(timestamp: { toDate?: () => Date }): string {
  const date = timestamp?.toDate?.()
  if (!date) return '—'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const LOT_STATUS_TONE: Record<AuctionLotStatus, BadgeTone> = {
  OPEN: 'gold',
  WINNER_PENDING: 'warning',
  SETTLED: 'success',
  NO_BIDS: 'neutral',
  PAYMENT_EXPIRED: 'danger',
}

const LOT_STATUS_LABEL: Record<AuctionLotStatus, string> = {
  OPEN: 'Live Bidding',
  WINNER_PENDING: 'Winner Awaiting Payment',
  SETTLED: 'Settled & Paid',
  NO_BIDS: 'Ended (No Bids)',
  PAYMENT_EXPIRED: 'Payment Window Expired',
}

export function SellerAuctionLots() {
  const [lots, setLots] = useState<SellerAuctionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)

    void (async () => {
      try {
        const items = await fetchSellerAuctionItems()
        if (!active) return
        setLots(items)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Could not load auction lots')
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <Card className="flex items-center justify-center gap-2 p-6">
        <Loader2 className="h-5 w-5 animate-spin text-accent-gold" />
        <span className="text-xs text-text-muted">Loading your auction listings...</span>
      </Card>
    )
  }

  if (error) {
    return null // Graceful silent degrade if seller has no auction activity
  }

  if (lots.length === 0) {
    return (
      <Card className="flex flex-col gap-2 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Gavel className="h-5 w-5 text-accent-gold" />
          <h2 className="font-display text-lg font-medium text-text-primary">Curated Auction Listings</h2>
        </div>
        <p className="text-sm text-text-secondary">
          None of your published artworks are currently scheduled for weekly auctions. ArtVault curators select eligible pieces for featured drops.
        </p>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Gavel className="h-5 w-5 text-accent-gold" />
          <h2 className="font-display text-lg font-medium text-text-primary">Your Auction Listings</h2>
        </div>
        <span className="text-xs text-text-muted">{lots.length} lot{lots.length === 1 ? '' : 's'}</span>
      </div>

      <div className="flex flex-col gap-3">
        {lots.map((lot) => (
          <div
            key={lot.id}
            className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-surface-elevated p-3.5 sm:flex-row sm:items-center"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Badge tone={LOT_STATUS_TONE[lot.lotStatus] ?? 'neutral'} size="sm">
                  {LOT_STATUS_LABEL[lot.lotStatus] ?? lot.lotStatus}
                </Badge>
                <span className="text-xs text-text-muted">
                  Starts: {formatDate(lot.startsAt)} · Ends: {formatDate(lot.endsAt)}
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xs text-text-muted">High Bid:</span>
                <span className="text-base font-semibold text-accent-gold">
                  {lot.currentHighBid > 0 ? formatAmount(lot.currentHighBid) : 'No bids yet'}
                </span>
                <span className="text-xs text-text-muted">({lot.bidCount} bids)</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link to={`/auctions/${lot.auctionId}?lot=${encodeURIComponent(lot.id)}`}>
                <Button type="button" variant="secondary" size="sm">
                  View Auction Lot
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

