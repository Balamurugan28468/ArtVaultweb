import { Box } from 'lucide-react'

/**
 * Visual/style contract for the future "View in AR" action (artwork cards,
 * detail pages, auctions, recommendations). Intentionally inert — no AR
 * engine exists yet, so this never launches a camera or simulates
 * placement. See docs/AR_ARCHITECTURE.md.
 */
export function ViewInArBadge({ className = '' }: { className?: string }) {
  return (
    <span
      role="button"
      aria-disabled="true"
      title="View in AR — available in a later module"
      className={`inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-accent-gold/40 bg-surface-elevated px-3 py-1.5 text-xs font-medium text-accent-gold opacity-70 ${className}`}
    >
      <Box aria-hidden="true" className="h-3.5 w-3.5" />
      View in AR
    </span>
  )
}
