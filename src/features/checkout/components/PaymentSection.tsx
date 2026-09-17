import { Card } from '@/shared/ui'
import { PaymentMethodSelector } from './PaymentMethodSelector'

/**
 * Honest, non-functional payment state (UI-02's "No fake functionality"
 * rule, applied here the same way ArtworkDetailPage's AI/AR panels already
 * apply it elsewhere in this app) — no payment provider is integrated
 * anywhere in this codebase (no Stripe/Razorpay keys, no `payments`
 * collection, no Cloud Function), and no trusted order-creation write path
 * exists yet either (see firestore.rules). UI-06 upgrades this from a
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
        Payment methods are unavailable. ArtVault does not yet support order placement or payment processing.
      </p>
      <PaymentMethodSelector />
    </Card>
  )
}
