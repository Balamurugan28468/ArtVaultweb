import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import {
  isOrderStatus,
  type Order,
  type OrderError,
  type OrderItem,
  type OrderItemPreview,
  type OrderShippingAddress,
  type OrderStatusEvent,
} from '../types'

function isFirestoreErrorLike(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error
}

export function toOrderError(error: unknown): OrderError {
  if (isFirestoreErrorLike(error)) {
    if (error.code === 'permission-denied') {
      return { code: 'permission-denied', message: 'You do not have permission to view that order.' }
    }
    if (error.code === 'unavailable' || error.code === 'deadline-exceeded') {
      return { code: 'network', message: 'Network unavailable. Check your connection and try again.' }
    }
  }
  return { code: 'unknown', message: 'Something went wrong. Please try again.' }
}

function mapToShippingAddress(value: unknown): OrderShippingAddress | null {
  if (typeof value !== 'object' || value === null) return null
  const data = value as Record<string, unknown>
  if (typeof data.fullName !== 'string' || typeof data.addressLine1 !== 'string') return null
  return {
    fullName: data.fullName,
    addressLine1: data.addressLine1,
    addressLine2: typeof data.addressLine2 === 'string' ? data.addressLine2 : null,
    city: typeof data.city === 'string' ? data.city : '',
    state: typeof data.state === 'string' ? data.state : '',
    postalCode: typeof data.postalCode === 'string' ? data.postalCode : '',
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
      imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : null,
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
    if (isOrderStatus(data.status) && data.at) {
      events.push({ status: data.status, at: data.at as OrderStatusEvent['at'] })
    }
  }
  return events
}

/** Defensive against a malformed/partial document the exact same way mapToArtwork is — a client never assumes every field is present. */
export function mapToOrder(id: string, data: Record<string, unknown>): Order | null {
  if (typeof data.buyerId !== 'string' || !isOrderStatus(data.status)) return null
  return {
    id,
    buyerId: data.buyerId,
    status: data.status,
    paymentState: typeof data.paymentState === 'string' ? (data.paymentState as Order['paymentState']) : 'PENDING',
    subtotal: typeof data.subtotal === 'number' ? data.subtotal : 0,
    shippingCost: typeof data.shippingCost === 'number' ? data.shippingCost : null,
    total: typeof data.total === 'number' ? data.total : 0,
    shippingAddress: mapToShippingAddress(data.shippingAddress),
    trackingState: typeof data.trackingState === 'string' ? data.trackingState : null,
    statusHistory: mapToStatusHistory(data.statusHistory),
    itemsPreview: mapToItemsPreview(data.itemsPreview),
    createdAt: data.createdAt as Order['createdAt'],
    updatedAt: data.updatedAt as Order['updatedAt'],
  }
}

function mapToOrderItem(id: string, data: Record<string, unknown>): OrderItem | null {
  if (typeof data.artworkId !== 'string' || typeof data.title !== 'string') return null
  return {
    id,
    artworkId: data.artworkId,
    sellerId: typeof data.sellerId === 'string' ? data.sellerId : '',
    title: data.title,
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : null,
    unitPrice: typeof data.unitPrice === 'number' ? data.unitPrice : 0,
    quantity: typeof data.quantity === 'number' ? data.quantity : 1,
    subtotal: typeof data.subtotal === 'number' ? data.subtotal : 0,
  }
}

function ordersCollection() {
  return collection(db, 'orders')
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
): Unsubscribe {
  const ordersQuery = query(ordersCollection(), where('buyerId', '==', buyerId), orderBy('createdAt', 'desc'))
  return onSnapshot(
    ordersQuery,
    (snapshot) => {
      const orders = snapshot.docs
        .map((docSnapshot) => mapToOrder(docSnapshot.id, docSnapshot.data()))
        .filter((order): order is Order => order !== null)
      onData(orders)
    },
    (error) => onError(toOrderError(error)),
  )
}

export async function getOrder(orderId: string): Promise<Order | null> {
  try {
    const snapshot = await getDoc(doc(db, 'orders', orderId))
    return snapshot.exists() ? mapToOrder(snapshot.id, snapshot.data()) : null
  } catch (error) {
    if (isFirestoreErrorLike(error) && error.code === 'permission-denied') return null
    throw toOrderError(error)
  }
}

export async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  try {
    const snapshot = await getDocs(collection(db, 'orders', orderId, 'items'))
    return snapshot.docs
      .map((docSnapshot) => mapToOrderItem(docSnapshot.id, docSnapshot.data()))
      .filter((item): item is OrderItem => item !== null)
  } catch (error) {
    if (isFirestoreErrorLike(error) && error.code === 'permission-denied') return []
    throw toOrderError(error)
  }
}
