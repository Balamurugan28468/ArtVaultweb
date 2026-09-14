import { Clock } from 'lucide-react'
import { formatCountdown, useAuctionCountdown } from '../hooks/useAuctionCountdown'
import type { Auction } from '../types'

/** Real, ticking, display-only countdown — see useAuctionCountdown's own comment on why this has zero security authority. */
export function AuctionCountdown({ auction }: { auction: Pick<Auction, 'startAt' | 'endAt'> }) {
  const { status, remainingMs } = useAuctionCountdown(auction)

  if (status === 'ENDED') {
    return (
      <p className="flex items-center gap-1.5 text-sm text-text-muted">
        <Clock aria-hidden="true" className="h-4 w-4" />
        Auction ended
      </p>
    )
  }

  const label = status === 'SCHEDULED' ? 'Starts in' : 'Ends in'
  return (
    <p className="flex items-center gap-1.5 text-sm text-text-secondary">
      <Clock aria-hidden="true" className="h-4 w-4 text-accent-gold" />
      {label} <span className="font-medium text-text-primary">{formatCountdown(remainingMs)}</span>
    </p>
  )
}
