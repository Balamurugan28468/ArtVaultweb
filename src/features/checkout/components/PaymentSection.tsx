import { Card } from '@/shared/ui'
import { PaymentMethodSelector } from './PaymentMethodSelector'

/** Checkout creates a reserved unpaid order before any provider interaction. */
export function PaymentSection() {
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <h2 className="font-display text-lg font-medium text-text-primary">Payment</h2>
      <p className="text-sm text-text-secondary">
        Live payment methods are unavailable. Create an unpaid order first. Razorpay test checkout is offered on that order only when configured.
      </p>
      <PaymentMethodSelector />
    </Card>
  )
}
