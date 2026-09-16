import { Banknote, CreditCard, Smartphone } from 'lucide-react'
import type { ComponentType } from 'react'

interface PaymentOption {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  reason: string
}

// Every option here is honestly unavailable — not because online payment
// specifically is missing, but because ArtVault has no trusted
// order-creation write path at all yet (see firestore.rules'
// `match /orders/{orderId}` comment: `allow write: if false` for every
// field, unconditionally). Card/UPI need a real payment gateway in
// addition to that; Cash on Delivery needs no payment gateway but still
// needs a trusted order to exist before it can be placed against — so it
// gets its own, distinct honest explanation rather than reusing the
// gateway-specific copy. None of these render as clickable — a disabled,
// clearly-labeled option is the honest state until each is genuinely
// backed by real functionality (UI-06 owner rule: "no fake functionality").
const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    id: 'card',
    label: 'Credit / Debit Card',
    icon: CreditCard,
    reason: 'Online payment will be available when secure payment processing is connected.',
  },
  {
    id: 'upi',
    label: 'UPI',
    icon: Smartphone,
    reason: 'Online payment will be available when secure payment processing is connected.',
  },
  {
    id: 'cod',
    label: 'Cash on Delivery',
    icon: Banknote,
    reason: "Cash on Delivery isn't available yet — ArtVault's order system doesn't process real orders until a trusted order-creation backend is connected.",
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
    <div role="radiogroup" aria-label="Payment method" className="flex flex-col gap-2">
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
