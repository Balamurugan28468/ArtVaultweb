import { Card } from '@/shared/ui'
import { PaymentMethodSelector } from './PaymentMethodSelector'

/**
 * Honest, non-functional payment state (UI-02's "No fake functionality"
 * rule, applied here the same way ArtworkDetailPage's AI/AR panels already
 * apply it elsewhere in this app) — no payment provider is integrated
 * anywhere in this codebase (no Stripe/Razorpay keys, no `payments`
 * collection, no payment Cloud Function). Trusted unpaid orders are now
 * created by the checkout callable. UI-06 upgraded this from a
 * single static paragraph into a real-looking, honestly-disabled
 * Card/UPI/Cash-on-Delivery selector (`PaymentMethodSelector`) — still zero
 * fake functionality, just clearer about what each option needs before it
 * can go live.
 */
export function PaymentSection() {
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <h2 className="font-display text-lg font-medium text-text-primary">Payment</h2>
      <p className="text-sm text-text-secondary">
        Payment methods are unavailable. You can create an unpaid order, but ArtVault cannot process payment yet.
      </p>
      <PaymentMethodSelector />
    </Card>
  )
}
