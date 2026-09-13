import { CreditCard } from 'lucide-react'
import { Card } from '@/shared/ui'

/**
 * Honest, non-functional payment state (UI-02's "No fake functionality"
 * rule, applied here the same way ArtworkDetailPage's AI/AR panels already
 * apply it elsewhere in this app) — no payment provider is integrated
 * anywhere in this codebase (no Stripe/Razorpay keys, no `payments`
 * collection, no Cloud Function). Rather than a fake card form that
 * pretends to charge anything, this is a plainly disabled, clearly labeled
 * panel — the real payment step arrives in a later module.
 */
export function PaymentSection() {
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <h2 className="font-display text-lg font-medium text-text-primary">Payment</h2>
      <div className="flex items-start gap-3 rounded-lg border border-border-strong bg-surface-elevated p-3 sm:p-4">
        <CreditCard aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
        <div>
          <p className="text-sm font-medium text-text-primary">Payment integration is not connected yet.</p>
          <p className="mt-1 text-sm text-text-secondary">
            ArtVault doesn't yet support taking real payment for an order. Once a payment provider is connected,
            you'll be able to pay securely here — no charge can be made until then.
          </p>
        </div>
      </div>
    </Card>
  )
}
