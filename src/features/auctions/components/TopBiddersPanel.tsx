import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { Card } from '@/shared/ui'
import { fetchAuctionBidHistory } from '../api/auctionsRepository'
import type { BidHistoryItem } from '../types'

function formatAmount(amount: number): string {
  return `₹${Math.round(amount / 100).toLocaleString('en-IN')}`
}

interface TopBiddersPanelProps {
  auctionItemId?: string
}

export function TopBiddersPanel({ auctionItemId }: TopBiddersPanelProps) {
  const [topBids, setTopBids] = useState<BidHistoryItem[]>([])

  useEffect(() => {
    if (!auctionItemId) return
    let active = true

    void (async () => {
      try {
        const history = await fetchAuctionBidHistory(auctionItemId)
        if (!active) return
        setTopBids(history.slice(0, 5))
      } catch {
        // Fall back gracefully
      }
    })()

    return () => {
      active = false
    }
  }, [auctionItemId])

  if (!auctionItemId) {
    return (
      <Card className="flex flex-col items-center gap-2 p-6 text-center">
        <Trophy aria-hidden="true" className="h-6 w-6 text-text-muted" />
        <p className="text-sm font-medium text-text-primary">Bid ranking unavailable</p>
        <p className="max-w-xs text-xs text-text-secondary">
          Once bidding is connected, the top bidders for this auction will be ranked here.
        </p>
      </Card>
    )
  }

  if (topBids.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 p-6 text-center">
        <Trophy aria-hidden="true" className="h-6 w-6 text-text-muted" />
        <p className="text-sm font-medium text-text-primary">Top Bidders</p>
        <p className="max-w-xs text-xs text-text-secondary">
          Top bids will appear here once bids are placed on this auction lot.
        </p>
      </Card>
    )
  }

  const AVATAR_COLORS = [
    'bg-purple-600/30 text-purple-300',
    'bg-pink-600/30 text-pink-300',
    'bg-red-600/30 text-red-300',
    'bg-emerald-600/30 text-emerald-300',
    'bg-cyan-600/30 text-cyan-300',
  ]

  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <Trophy aria-hidden="true" className="h-4 w-4 text-accent-gold" />
        <h2 className="font-display text-base font-medium text-text-primary">Top Bidders</h2>
      </div>
      <div className="flex flex-col gap-2">
        {topBids.map((bid, index) => {
          const bidderName = bid.bidderName ?? `Bidder #${index + 1}`
          const parts = bidderName.trim().split(/\s+/)
          const initials = (parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : bidderName.slice(0, 2)).toUpperCase()

          return (
            <div
              key={bid.bidId}
              className="flex items-center justify-between rounded-md border border-border/60 bg-surface px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    index === 0
                      ? 'bg-accent-gold text-bg'
                      : index === 1
                        ? 'bg-slate-300 text-bg'
                        : index === 2
                          ? 'bg-amber-700 text-white'
                          : 'bg-surface-elevated text-text-secondary'
                  }`}
                >
                  {index + 1}
                </span>
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${
                    AVATAR_COLORS[index % AVATAR_COLORS.length]
                  }`}
                >
                  {initials}
                </span>
                <span className="font-medium text-text-primary">{bidderName}</span>
              </div>
              <span className="font-semibold text-text-primary">{formatAmount(bid.amountMinor)}</span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
