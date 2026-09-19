import type { Order } from '../types'

export function ReservationNotice({ order }: { order: Order }) {
  if (order.pricingState !== 'ITEMS_ONLY') return null
  return <div className="flex flex-col gap-2 text-sm text-text-secondary" role="status">
    <p>This amount is the artwork subtotal. Shipping and taxes are not priced. Payment integration is the next step; payment cannot be made here.</p>
    {order.reservationStatus === 'ACTIVE' && order.reservationExpiresAt && <p>Recorded reservation deadline: {order.reservationExpiresAt.toDate().toLocaleString()}. Unpaid reservations are released by the trusted expiry process.</p>}
    {order.reservationStatus === 'RELEASED' && order.cancellationReason === 'RESERVATION_EXPIRED' && <p>This unpaid order expired and its inventory reservation was released.</p>}
  </div>
}
