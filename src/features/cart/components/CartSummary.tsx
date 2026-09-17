import type { ReactNode } from 'react'
import { Card } from '@/shared/ui'

/** Displays the current artwork subtotal, never a payable total. */
export function CartSummary({
  subtotal,
  itemCount,
  action,
  title = 'Order Summary',
}: {
  subtotal: number
  itemCount: number
  action?: ReactNode
  title?: string
}) {
  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <h2 className="font-display text-lg font-medium text-text-primary">{title}</h2>

      <div className="flex flex-col gap-2 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 text-text-secondary">
          <span>
            Subtotal ({itemCount} item{itemCount === 1 ? '' : 's'})
          </span>
          <span className="text-text-primary">₹{(subtotal / 100).toFixed(0)}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-text-secondary">
          <span>Shipping</span>
          <span className="text-text-muted">Unavailable</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-text-secondary">
          <span>Taxes</span>
          <span className="text-text-muted">Unavailable</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-sm font-medium text-text-primary">Artwork subtotal</span>
        <span className="font-display text-xl font-medium text-accent-gold">₹{(subtotal / 100).toFixed(0)}</span>
      </div>
      <p className="text-xs text-text-muted">Shipping and taxes are unavailable. This is not a final payable total.</p>

      {action}
    </Card>
  )
}
