import type { ReactNode } from 'react'
import { Card } from '@/shared/ui'

/**
 * Order Summary card — shared by the Cart page and Checkout's Review
 * section (UI-02 scope explicitly calls for both). Deliberately shows only
 * what this codebase actually supports: a real subtotal computed from live
 * artwork prices (see useCartLines), and nothing invented for
 * shipping/tax/discounts — no shipping-rate table, tax engine, or coupon
 * system exists anywhere in this project yet, so showing a fabricated
 * number for any of them would be a fake-functionality violation (UI-02's
 * own "No fake functionality" rule). "Calculated at checkout" is the
 * explicitly-sanctioned honest placeholder for that gap; the total shown
 * is the real subtotal alone, with a note that it excludes shipping/taxes
 * rather than silently implying it's the final charge.
 */
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
        <div className="flex items-center justify-between text-text-secondary">
          <span>
            Subtotal ({itemCount} item{itemCount === 1 ? '' : 's'})
          </span>
          <span className="text-text-primary">₹{(subtotal / 100).toFixed(0)}</span>
        </div>
        <div className="flex items-center justify-between text-text-secondary">
          <span>Shipping</span>
          <span className="text-text-muted">Calculated at checkout</span>
        </div>
        <div className="flex items-center justify-between text-text-secondary">
          <span>Taxes</span>
          <span className="text-text-muted">Calculated at checkout</span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm font-medium text-text-primary">Estimated total</span>
        <span className="font-display text-xl font-medium text-accent-gold">₹{(subtotal / 100).toFixed(0)}</span>
      </div>
      <p className="text-xs text-text-muted">Excludes shipping and taxes, calculated at checkout.</p>

      {action}
    </Card>
  )
}
