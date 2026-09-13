import { Truck } from 'lucide-react'
import { Card } from '@/shared/ui'

/**
 * Honest informational state, not a fake method picker — no shipping
 * carrier/rate integration exists yet (no `shipments` collection, no rate
 * API), so this deliberately never renders a list of selectable shipping
 * methods with invented prices/ETAs (UI-02's "No fake functionality"
 * rule). Mirrors PaymentSection's own approach to the same gap.
 */
export function DeliverySection() {
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <h2 className="font-display text-lg font-medium text-text-primary">Delivery</h2>
      <div className="flex items-start gap-3 rounded-lg border border-border-strong bg-surface-elevated p-3 sm:p-4">
        <Truck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
        <div>
          <p className="text-sm font-medium text-text-primary">Shipping options aren't connected yet.</p>
          <p className="mt-1 text-sm text-text-secondary">
            Real delivery methods, rates, and estimated arrival dates will appear here once shipping is integrated.
          </p>
        </div>
      </div>
    </Card>
  )
}
