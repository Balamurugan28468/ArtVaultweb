import { createClient } from '@/lib/supabase/client'
import { dataError, observe, result, signedImage } from '@/lib/supabase/data'
import { Timestamp, timestamp } from '@/lib/supabase/timestamp'
import {
  isOrderStatus,
  type Order,
  type OrderError,
  type OrderItem,
  type OrderItemPreview,
  type OrderShippingAddress,
  type OrderStatusEvent,
} from '../types'

export const toOrderError = dataError

function mapToShippingAddress(value: unknown): OrderShippingAddress | null {
  if (typeof value !== 'object' || value === null) return null
  const data = value as Record<string, unknown>
  const fullName = typeof data.full_name === 'string' ? data.full_name : data.fullName
  const line1 = typeof data.address_line1 === 'string' ? data.address_line1 : data.addressLine1
  if (typeof fullName !== 'string' || typeof line1 !== 'string') return null
  return {
    fullName,
    addressLine1: line1,
    addressLine2: typeof data.address_line2 === 'string' ? data.address_line2 : typeof data.addressLine2 === 'string' ? data.addressLine2 : null,
    city: typeof data.city === 'string' ? data.city : '',
    state: typeof data.state === 'string' ? data.state : '',
    postalCode: typeof data.postal_code === 'string' ? data.postal_code : typeof data.postalCode === 'string' ? data.postalCode : '',
    country: typeof data.country === 'string' ? data.country : '',
    phone: typeof data.phone === 'string' ? data.phone : null,
  }
}

function mapToItemsPreview(value: unknown): OrderItemPreview[] {
  if (!Array.isArray(value)) return []
  const previews: OrderItemPreview[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue
    const data = entry as Record<string, unknown>
    if (typeof data.title !== 'string') continue
    previews.push({
      title: data.title,
      imageUrl: typeof data.image_url === 'string' ? data.image_url : typeof data.imageUrl === 'string' ? data.imageUrl : null,
      quantity: typeof data.quantity === 'number' ? data.quantity : 1,
    })
  }
  return previews
}

function mapToStatusHistory(value: unknown): OrderStatusEvent[] {
  if (!Array.isArray(value)) return []
  const events: OrderStatusEvent[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue
    const data = entry as Record<string, unknown>
    const status = typeof data.event_type === 'string' ? data.event_type : data.status
    const occurredAt = typeof data.occurred_at === 'string' ? data.occurred_at : data.at
    if (isOrderStatus(status) && occurredAt) {
      events.push({ status, at: occurredAt instanceof Timestamp ? occurredAt : timestamp(occurredAt) })
    }
  }
  return events
}

/** Defensive against a malformed/partial document the exact same way mapToArtwork is — a client never assumes every field is present. */
export function mapToOrder(id: string, data: Record<string, unknown>): Order | null {
  const buyerId = typeof data.buyer_id === 'string' ? data.buyer_id : data.buyerId
  if (typeof buyerId !== 'string' || !isOrderStatus(data.status)) return null
  return {
    id,
    buyerId,
    status: data.status,
    paymentState: typeof (data.payment_state ?? data.paymentState) === 'string' && ['PENDING', 'PAID', 'FAILED', 'REFUNDED'].includes(String(data.payment_state ?? data.paymentState)) ? (data.payment_state ?? data.paymentState) as Order['paymentState'] : null,
    subtotal: typeof (data.subtotal_minor ?? data.subtotal) === 'number' ? Number(data.subtotal_minor ?? data.subtotal) : 0,
    shippingCost: typeof (data.shipping_minor ?? data.shippingCost) === 'number' ? Number(data.shipping_minor ?? data.shippingCost) : null,
    total: typeof (data.total_minor ?? data.total) === 'number' ? Number(data.total_minor ?? data.total) : 0,
    ...(typeof data.currency === 'string' ? { currency: data.currency } : {}),
    ...(data.pricing_state === 'ITEMS_ONLY' || data.pricingState === 'ITEMS_ONLY' ? { pricingState: 'ITEMS_ONLY' as const } : {}),
    ...(data.reservation_status === 'ACTIVE' || data.reservation_status === 'RELEASED' || data.reservationStatus === 'ACTIVE' || data.reservationStatus === 'RELEASED' ? { reservationStatus: (data.reservation_status ?? data.reservationStatus) as 'ACTIVE' | 'RELEASED' } : {}),
    ...(typeof data.reservation_expires_at === 'string' ? { reservationExpiresAt: timestamp(data.reservation_expires_at) } : data.reservationExpiresAt instanceof Timestamp ? { reservationExpiresAt: data.reservationExpiresAt } : {}),
    ...(typeof (data.cancellation_reason ?? data.cancellationReason) === 'string' ? { cancellationReason: String(data.cancellation_reason ?? data.cancellationReason) } : {}),
    shippingAddress: mapToShippingAddress(data.shippingAddress),
    trackingState: typeof data.trackingState === 'string' ? data.trackingState : null,
    statusHistory: mapToStatusHistory(data.statusHistory),
    itemsPreview: mapToItemsPreview(data.itemsPreview),
    createdAt: typeof data.created_at === 'string' ? timestamp(data.created_at) : data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now(),
    updatedAt: typeof data.updated_at === 'string' ? timestamp(data.updated_at) : data.updatedAt instanceof Timestamp ? data.updatedAt : Timestamp.now(),
  }
}

function mapToOrderItem(id: string, data: Record<string, unknown>): OrderItem | null {
  const artworkId = typeof data.artwork_id === 'string' ? data.artwork_id : data.artworkId
  if (typeof artworkId !== 'string' || typeof data.title !== 'string') return null
  return {
    id,
    artworkId,
    sellerId: typeof data.seller_id === 'string' ? data.seller_id : typeof data.sellerId === 'string' ? data.sellerId : '',
    title: data.title,
    imageUrl: typeof data.image_url === 'string' ? data.image_url : typeof data.imageUrl === 'string' ? data.imageUrl : null,
    unitPrice: typeof (data.unit_price_minor ?? data.unitPrice) === 'number' ? Number(data.unit_price_minor ?? data.unitPrice) : 0,
    quantity: typeof data.quantity === 'number' ? data.quantity : 1,
    subtotal: typeof (data.subtotal_minor ?? data.subtotal) === 'number' ? Number(data.subtotal_minor ?? data.subtotal) : 0,
  }
}

async function readItems(orderId: string): Promise<OrderItem[]> {
  const rows = (await result(createClient().from('order_items').select('*').eq('order_id', orderId).order('created_at'))) ?? []
  return await Promise.all(rows.map(async (row) => {
    const item = mapToOrderItem(row.id, row)
    if (!item) return null
    return { ...item, imageUrl: item.imageUrl ? await signedImage(item.imageUrl) : null }
  })).then((items) => items.filter((item): item is OrderItem => item !== null))
}

async function mapStoredOrder(row: Record<string, unknown>): Promise<Order | null> {
  const itemIdRows = (await result(createClient().from('order_items').select('id').eq('order_id', row.id))) ?? []
  const itemIds = itemIdRows.map((item) => item.id)
  const [items, address, events, reservations] = await Promise.all([
    readItems(String(row.id)),
    result(createClient().from('order_addresses').select('*').eq('order_id', row.id).maybeSingle()),
    result(createClient().from('order_events').select('*').eq('order_id', row.id).order('sequence')),
    itemIds.length > 0
      ? result(createClient().from('inventory_reservations').select('status,expires_at').in('order_item_id', itemIds))
      : Promise.resolve([]),
  ])
  const firstReservation = reservations?.[0]
  return mapToOrder(String(row.id), {
    ...row,
    shippingAddress: address,
    statusHistory: events,
    itemsPreview: items.map((item) => ({ title: item.title, imageUrl: item.imageUrl, quantity: item.quantity })),
    reservation_status: firstReservation?.status,
    reservation_expires_at: firstReservation?.expires_at,
  })
}

/**
 * One listener over the signed-in buyer's own orders, newest first —
 * matches firestore.rules' `buyerId == request.auth.uid` read rule exactly
 * (a query for any other buyerId would simply return nothing, never an
 * error, since Firestore evaluates security rules per-document against
 * whatever the query already scoped to). Genuinely returns an empty list
 * today for every account, since no order-creation path exists yet — that
 * is the honest, correct result, not a bug in this function.
 */
export function subscribeOrders(
  buyerId: string,
  onData: (orders: Order[]) => void,
  onError: (error: OrderError) => void,
): () => void {
  return observe('orders', `buyer_id=eq.${buyerId}`, async () => {
    const rows = (await result(createClient().from('orders').select('*').eq('buyer_id', buyerId).order('created_at', { ascending: false }))) ?? []
    return (await Promise.all(rows.map(mapStoredOrder))).filter((order): order is Order => order !== null)
  }, onData, onError)
}

export async function getOrder(orderId: string): Promise<Order | null> {
  try {
    const row = await result(createClient().from('orders').select('*').eq('id', orderId).maybeSingle())
    return row ? mapStoredOrder(row) : null
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && String(error.code) === 'permission-denied') return null
    throw toOrderError(error)
  }
}

export async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  try {
    return await readItems(orderId)
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && String(error.code) === 'permission-denied') return []
    throw toOrderError(error)
  }
}
