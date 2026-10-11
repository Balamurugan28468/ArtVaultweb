import { Banknote, CreditCard, Smartphone } from 'lucide-react'
import type { ComponentType } from 'react'

interface PaymentOption {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  reason: string
}

// Live methods and cash collection remain unavailable. Configured Razorpay
// TEST checkout opens separately after creating a trusted reserved order.
const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    id: 'card',
    label: 'Credit / Debit Card',
    icon: CreditCard,
    reason: 'Unavailable. Requires secure payment processing.',
  },
  {
    id: 'upi',
    label: 'UPI',
    icon: Smartphone,
    reason: 'Unavailable. Requires secure payment processing.',
  },
  {
    id: 'cod',
    label: 'Cash on Delivery',
    icon: Banknote,
    reason: 'Cash on Delivery is unavailable. Cash collection and fulfillment are not connected.',
  },
]

/**
 * A polished-looking but honestly disabled payment-method selector — every
 * option shows a real icon/label/explanation but is a genuine native
 * `disabled` control, never a clickable affordance that implies more than
 * currently exists (same discipline as AccountSections' `FUTURE_SECTIONS`
 * disabled tiles).
 */
export function PaymentMethodSelector() {
  return (
    <div role="radiogroup" aria-label="Payment method — unavailable" className="flex flex-col gap-2">
      {PAYMENT_OPTIONS.map(({ id, label, icon: Icon, reason }) => (
        <label
          key={id}
          htmlFor={`payment-${id}`}
          className="flex cursor-not-allowed items-start gap-3 rounded-lg border border-border-strong bg-surface-elevated p-3 opacity-70 sm:p-4"
        >
          <input
            id={`payment-${id}`}
            type="radio"
            name="payment-method"
            disabled
            aria-disabled="true"
            className="mt-1 h-4 w-4 shrink-0"
          />
          <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
          <div>
            <p className="text-sm font-medium text-text-primary">{label}</p>
            <p className="mt-1 text-sm text-text-secondary">{reason}</p>
          </div>
        </label>
      ))}
    </div>
  )
}
