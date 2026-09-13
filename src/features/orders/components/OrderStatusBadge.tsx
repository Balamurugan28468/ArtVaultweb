import { Badge, type BadgeTone } from '@/shared/ui'
import type { OrderStatus } from '../types'

// Never relies on color alone (WCAG) — every badge pairs its tone with a
// real, distinct text label (see STATUS_LABEL), so two badges are never
// indistinguishable to a colorblind viewer or in a screen reader.
const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  CREATED: 'neutral',
  PAYMENT_PENDING: 'warning',
  PAID: 'gold',
  SELLER_CONFIRMED: 'gold',
  PROCESSING: 'gold',
  PACKED: 'gold',
  SHIPPED: 'gold',
  OUT_FOR_DELIVERY: 'gold',
  DELIVERED: 'success',
  CANCELLED: 'danger',
  REFUND_REQUESTED: 'warning',
  REFUNDED: 'neutral',
  DELIVERY_FAILED: 'danger',
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  CREATED: 'Order placed',
  PAYMENT_PENDING: 'Payment pending',
  PAID: 'Paid',
  SELLER_CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  PACKED: 'Packed',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUND_REQUESTED: 'Refund requested',
  REFUNDED: 'Refunded',
  DELIVERY_FAILED: 'Delivery failed',
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>
}
