import { splitCountdown, useAuctionCountdown } from '../hooks/useAuctionCountdown'
import type { Auction } from '../types'

const UNITS: { key: keyof ReturnType<typeof splitCountdown>; label: string }[] = [
  { key: 'days', label: 'Days' },
  { key: 'hours', label: 'Hours' },
  { key: 'minutes', label: 'Minutes' },
  { key: 'seconds', label: 'Seconds' },
]

/**
 * The prominent "Days / Hours / Minutes / Seconds" boxed countdown used by
 * the Auctions hero and the detail page's bid panel — a real, ticking
 * display over the exact same `useAuctionCountdown` hook (and therefore
 * the exact same trusted `startAt`/`endAt` values) that `AuctionCountdown`
 * itself uses for its compact single-line form on cards. Purely a
 * presentation choice between the two; neither has any security authority
 * (see useAuctionCountdown's own header comment).
 */
export function AuctionCountdownBoxes({ auction, size = 'md' }: { auction: Pick<Auction, 'startAt' | 'endAt'>; size?: 'sm' | 'md' }) {
  const { status, remainingMs } = useAuctionCountdown(auction)

  if (status === 'ENDED') {
    return <p className="text-sm text-text-muted">Auction ended</p>
  }

  const parts = splitCountdown(remainingMs)
  const boxSize = size === 'sm' ? 'h-12 w-12 text-lg' : 'h-14 w-14 text-xl sm:h-16 sm:w-16 sm:text-2xl'

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-text-secondary">{status === 'SCHEDULED' ? 'Starts in' : 'Ends in'}</p>
      <div className="flex gap-2">
        {UNITS.map(({ key, label }) => (
          <div key={key} className="flex flex-col items-center gap-1">
            <div className={`flex items-center justify-center rounded-lg border border-border-strong bg-surface-elevated font-display font-medium text-text-primary tabular-nums ${boxSize}`}>
              {String(parts[key]).padStart(2, '0')}
            </div>
            <span className="text-[10px] text-text-muted uppercase">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
