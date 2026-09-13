import type { Timestamp } from 'firebase/firestore'

// The full intended order lifecycle (UI-02 scope). No client write path
// exists yet for any of these — see firestore.rules' own comment on
// `orders/{orderId}` — so every one of these states can only ever appear
// once a future trusted server operation starts writing real orders.
// OrderStatusTimeline only ever renders the stages a given order's own
// data actually contains, never every stage in this list unconditionally
// (see that component's own comment).
export const ORDER_STATUSES = [
  'CREATED',
  'PAYMENT_PENDING',
  'PAID',
  'SELLER_CONFIRMED',
  'PROCESSING',
  'PACKED',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'REFUND_REQUESTED',
  'REFUNDED',
  'DELIVERY_FAILED',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value)
}

/** The subset of statuses that represents normal forward progress — used to build OrderStatusTimeline's main track. */
export const ORDER_PROGRESS_STATUSES: OrderStatus[] = [
  'CREATED',
  'PAYMENT_PENDING',
  'PAID',
  'SELLER_CONFIRMED',
  'PROCESSING',
  'PACKED',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
]

/** Terminal/exception statuses that end the lifecycle outside normal forward progress. */
export const ORDER_TERMINAL_STATUSES: OrderStatus[] = ['CANCELLED', 'REFUND_REQUESTED', 'REFUNDED', 'DELIVERY_FAILED']

export type PaymentState = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'

/**
 * Canonical shape of an orders/{orderId} Firestore document (see
 * docs/DATABASE.md, firestore.rules). Read-only from every client today —
 * written only by a future trusted server operation, never by this app's
 * own code. `shippingAddress` and per-item price/title are snapshots taken
 * at order-creation time (unlike the live-joined Cart/Wishlist pattern) —
 * a real order must keep showing what was actually charged and shipped
 * even if the artwork's price or the seller's own listing changes later.
 */
export interface Order {
  id: string
  buyerId: string
  status: OrderStatus
  paymentState: PaymentState
  subtotal: number
  shippingCost: number | null
  total: number
  shippingAddress: OrderShippingAddress | null
  trackingState: string | null
  statusHistory: OrderStatusEvent[]
  /**
   * A small denormalized preview of this order's items (title/image/
   * quantity only), written alongside the order itself by whatever future
   * trusted operation creates orders — exists purely so My Orders can show
   * a real thumbnail/title per card without an N+1 read of every order's
   * full `items` subcollection. The full, authoritative per-item snapshot
   * (price, subtotal, seller) still lives only in `items` — see OrderItem
   * — and is what Order Details reads.
   */
  itemsPreview: OrderItemPreview[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface OrderItemPreview {
  title: string
  imageUrl: string | null
  quantity: number
}

export interface OrderStatusEvent {
  status: OrderStatus
  at: Timestamp
}

export interface OrderShippingAddress {
  fullName: string
  addressLine1: string
  addressLine2: string | null
  city: string
  state: string
  postalCode: string
  country: string
  phone: string | null
}

/** orders/{orderId}/items/{itemId} — a price/title snapshot, for the same reason the parent order is a snapshot. */
export interface OrderItem {
  id: string
  artworkId: string
  sellerId: string
  title: string
  imageUrl: string | null
  unitPrice: number
  quantity: number
  subtotal: number
}

export type OrderErrorCode = 'permission-denied' | 'network' | 'unknown'

export interface OrderError {
  code: OrderErrorCode
  message: string
}

export function isOrderError(value: unknown): value is OrderError {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value
}

export type OrderListState =
  | { status: 'loading' }
  | { status: 'loaded'; orders: Order[] }
  | { status: 'error'; error: OrderError }

export type OrderState =
  | { status: 'loading' }
  | { status: 'loaded'; order: Order; items: OrderItem[] }
  | { status: 'missing' }
  | { status: 'error'; error: OrderError }
