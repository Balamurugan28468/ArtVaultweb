import { useEffect, useState } from 'react'
import { Eye, Heart, History, Loader2, Share2 } from 'lucide-react'
import { Card } from '@/shared/ui'
import { fetchAuctionBidHistory } from '../api/auctionsRepository'
import type { AuctionStatus, BidHistoryItem } from '../types'

function formatAmount(amount: number): string {
  return `₹${Math.round(amount / 100).toLocaleString('en-IN')}`
}

function formatRelativeTime(timestamp: { toDate?: () => Date }): string {
  const date = timestamp?.toDate?.()
  if (!date) return ''
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diffSec < 60) return 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  return `${diffDays}d ago`
}

interface BidHistoryPanelProps {
  status?: AuctionStatus
  auctionItemId?: string
  watchingCount?: number | null
  likeCount?: number | null
  onShare?: () => void
}

const AVATAR_COLORS = [
  'bg-purple-600/30 text-purple-300',
  'bg-pink-600/30 text-pink-300',
  'bg-red-600/30 text-red-300',
  'bg-emerald-600/30 text-emerald-300',
  'bg-cyan-600/30 text-cyan-300',
  'bg-blue-600/30 text-blue-300',
]

export function BidHistoryPanel({
  status,
  auctionItemId,
  watchingCount,
  likeCount,
  onShare,
}: BidHistoryPanelProps) {
  const heading = status === 'LIVE' ? 'Live Bidding' : 'Bid History'
  const [bids, setBids] = useState<BidHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!auctionItemId) return
    let active = true
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const history = await fetchAuctionBidHistory(auctionItemId)
        if (!active) return
        setBids(history)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Could not load bid history')
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [auctionItemId])

  if (!auctionItemId) {
    return (
      <Card className="flex flex-col items-center gap-2 p-6 text-center">
        <History aria-hidden="true" className="h-6 w-6 text-text-muted" />
        <p className="text-sm font-medium text-text-primary">{heading} isn't connected yet</p>
        <p className="max-w-xs text-xs text-text-secondary">
          Once bidding goes live, every bid placed on this auction will appear here in real time.
        </p>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 p-6 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-accent-gold" />
        <p className="text-xs text-text-muted">Loading live bids...</p>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="flex flex-col items-center gap-2 p-6 text-center">
        <p className="text-xs text-red-400">{error}</p>
      </Card>
    )
  }

  if (bids.length === 0) {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 className="text-sm font-medium text-text-primary">{heading}</h3>
          <span className="text-xs text-text-muted">0 bids</span>
        </div>
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <History aria-hidden="true" className="h-6 w-6 text-text-muted" />
          <p className="max-w-xs text-xs text-text-secondary">
            No bids placed yet. Be the first to place a bid on this artwork!
          </p>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-text-muted">
          <div className="flex items-center gap-3">
            {typeof watchingCount === 'number' && (
              <div className="flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" />
                <span>{watchingCount} Watching</span>
              </div>
            )}
            {typeof likeCount === 'number' && (
              <div className="flex items-center gap-1.5">
                <Heart className="h-3.5 w-3.5" />
                <span>{likeCount} Likes</span>
              </div>
            )}
          </div>
          {onShare && (
            <button
              type="button"
              onClick={onShare}
              className="flex items-center gap-1.5 hover:text-text-primary transition-colors ml-auto"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span>Share</span>
            </button>
          )}
        </div>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-sm font-medium text-text-primary">{heading}</h3>
        <span className="text-xs text-text-muted">{bids.length} bids</span>
      </div>
      <div className="flex max-h-72 flex-col gap-2.5 overflow-y-auto pr-1">
        {bids.map((bid, index) => {
          const bidderName = bid.bidderName ?? `Bidder #${bids.length - index}`
          const parts = bidderName.trim().split(/\s+/)
          const initials = (parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : bidderName.slice(0, 2)).toUpperCase()

          return (
            <div
              key={bid.bidId}
              className="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-surface-elevated/40"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ${
                    AVATAR_COLORS[index % AVATAR_COLORS.length]
                  }`}
                >
                  {initials}
                </span>
                <div>
                  <div className="font-medium text-text-primary">{bidderName}</div>
                  <div className="text-[11px] font-semibold text-text-primary">
                    {formatAmount(bid.amountMinor)}
                  </div>
                </div>
              </div>
              <span className="text-[11px] text-text-muted">{formatRelativeTime(bid.placedAt)}</span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-text-muted">
        <div className="flex items-center gap-3">
          {typeof watchingCount === 'number' && (
            <div className="flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              <span>{watchingCount} Watching</span>
            </div>
          )}
          {typeof likeCount === 'number' && (
            <div className="flex items-center gap-1.5">
              <Heart className="h-3.5 w-3.5" />
              <span>{likeCount} Likes</span>
            </div>
          )}
        </div>
        {onShare && (
          <button
            type="button"
            onClick={onShare}
            className="flex items-center gap-1.5 hover:text-text-primary transition-colors ml-auto"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span>Share</span>
          </button>
        )}
      </div>
    </Card>
  )
}
