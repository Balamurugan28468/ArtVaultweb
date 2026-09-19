import { createHash } from 'node:crypto'
import { getFirestore, Timestamp, type Firestore, type DocumentData } from 'firebase-admin/firestore'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'

export const RESERVATION_MINUTES = 30
const MAX_LINES = 50
const CURRENCY = 'INR'
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
function fail(message: string): never { throw new HttpsError('failed-precondition', message) }
function id(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw new HttpsError('invalid-argument', `Invalid ${field}.`)
  return value
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpsError('invalid-argument', 'Invalid request.')
  return value as Record<string, unknown>
}
export function requireCommerceRole(request: CallableRequest<unknown>, roles: string[]): string {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to continue.')
  if (!roles.includes(request.auth.token.role as string)) throw new HttpsError('permission-denied', 'Your account cannot perform this operation.')
  return request.auth.uid
}
export function parseCheckoutInput(raw: unknown) {
  const input = object(raw)
  if (['uid', 'buyerId', 'userId'].some((key) => Object.hasOwn(input, key))) throw new HttpsError('invalid-argument', 'Buyer identity comes from authentication only.')
  if (!Array.isArray(input.artworkIds) || input.artworkIds.length < 1 || input.artworkIds.length > MAX_LINES) throw new HttpsError('invalid-argument', 'Select between 1 and 50 cart items.')
  const artworkIds = input.artworkIds.map((value) => id(value, 'artwork ID')).sort()
  if (new Set(artworkIds).size !== artworkIds.length) throw new HttpsError('invalid-argument', 'Duplicate artwork IDs.')
  const addressId = id(input.addressId, 'address ID')
  if (typeof input.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(input.idempotencyKey)) throw new HttpsError('invalid-argument', 'Invalid checkout request key.')
  // Quantities, prices, totals, currency and payment state in raw input are
  // deliberately never read. Cart quantities and listing prices are authoritative.
  return { artworkIds, addressId, idempotencyKey: input.idempotencyKey }
}
export function inventory(data: DocumentData) {
  const physical = data.inventoryCount, reserved = data.reservedCount ?? 0
  if (!Number.isSafeInteger(physical) || physical < 0 || !Number.isSafeInteger(reserved) || reserved < 0 || reserved > physical) fail('Artwork stock needs seller review.')
  return { physical: physical as number, reserved: reserved as number, available: physical - reserved }
}
export function addressSnapshot(data: DocumentData | undefined) {
  if (!data) throw new HttpsError('permission-denied', 'Select an address saved to your account.')
  const bounds: Record<string, [number, number]> = { fullName: [2, 80], addressLine1: [3, 120], city: [2, 60], state: [2, 60], country: [2, 60] }
  const result: Record<string, string | null> = {}
  for (const [key, [min, max]] of Object.entries(bounds)) {
    const value = data[key]
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) fail('Complete your saved shipping address before checkout.')
    result[key] = value.trim()
  }
  if (typeof data.postalCode !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9\s-]{2,9}$/.test(data.postalCode.trim())) fail('The saved postal code is invalid.')
  result.postalCode = data.postalCode.trim()
  for (const key of ['addressLine2', 'phone']) {
    const value = data[key] ?? ''
    if (typeof value !== 'string' || (key === 'addressLine2' ? value.trim().length > 120 : value.trim() !== '' && !/^[0-9+()\-\s]{6,20}$/.test(value.trim()))) fail('The saved shipping address is invalid.')
    result[key] = value.trim() || null
  }
  return result
}
function receipt(orderId: string, data: DocumentData) {
  return { orderId, amount: data.total as number, currency: data.currency as string, status: data.status as string, pricingState: data.pricingState as string, reservationExpiresAt: (data.reservationExpiresAt as Timestamp).toMillis() }
}

export async function handleCreateCheckoutOrder(request: CallableRequest<unknown>, suppliedDb?: Firestore) {
  const buyerId = requireCommerceRole(request, ['CUSTOMER', 'SELLER'])
  const input = parseCheckoutInput(request.data)
  const db = suppliedDb ?? getFirestore()
  const key = digest(`${buyerId}\0${input.idempotencyKey}`)
  const requestRef = db.collection('checkoutRequests').doc(key)
  const orderRef = db.collection('orders').doc(key)
  const fingerprint = digest(JSON.stringify({ artworkIds: input.artworkIds, addressId: input.addressId }))
  return db.runTransaction(async (tx) => {
    const previous = await tx.get(requestRef)
    if (previous.exists) {
      if (previous.get('buyerId') !== buyerId || previous.get('fingerprint') !== fingerprint) throw new HttpsError('already-exists', 'This checkout key belongs to a different request.')
      const order = await tx.get(orderRef)
      if (!order.exists || order.get('buyerId') !== buyerId) fail('The previous checkout needs support review.')
      return receipt(orderRef.id, order.data()!)
    }
    const addressRef = db.doc(`addresses/${buyerId}/entries/${input.addressId}`)
    const cartRefs = input.artworkIds.map((artworkId) => db.doc(`carts/${buyerId}/items/${artworkId}`))
    const artworkRefs = input.artworkIds.map((artworkId) => db.doc(`artworks/${artworkId}`))
    // All reads precede every write, including cart and address. A concurrent
    // quantity/address/stock/moderation edit makes Firestore retry the transaction.
    const [address, ...records] = await tx.getAll(addressRef, ...cartRefs, ...artworkRefs)
    const shippingAddress = addressSnapshot(address.data())
    let subtotal = 0
    const items = input.artworkIds.map((artworkId, index) => {
      const cart = records[index], artwork = records[index + input.artworkIds.length]
      const quantity = cart.get('quantity') as number
      if (!cart.exists || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) fail('Your cart changed. Review it before checkout.')
      const data = artwork.data()
      if (!data || data.status !== 'PUBLISHED') fail('A selected artwork is no longer available.')
      if (typeof data.sellerId !== 'string' || !data.sellerId || data.sellerId === buyerId) fail('You cannot purchase this artwork.')
      const stock = inventory(data)
      if (stock.available < quantity) fail('Not enough available stock. Review your cart quantities.')
      if (!Number.isSafeInteger(data.price) || data.price < 100 || typeof data.title !== 'string' || !data.title.trim()) fail('Artwork pricing needs seller review.')
      const lineTotal = data.price * quantity
      subtotal += lineTotal
      if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(subtotal)) fail('Order amount is outside the supported range.')
      const image = Array.isArray(data.images) ? data.images[0] : undefined
      return { artworkId, sellerId: data.sellerId, title: data.title, unitPrice: data.price, quantity, subtotal: lineTotal,
        imageUrl: typeof image?.url === 'string' ? image.url : null, imagePath: typeof image?.path === 'string' ? image.path : null,
        reservedAfter: stock.reserved + quantity }
    })
    const now = Timestamp.now()
    const order = { buyerId, status: 'PAYMENT_PENDING', paymentState: 'PENDING', currency: CURRENCY,
      subtotal, total: subtotal, shippingCost: null, taxCost: null, pricingState: 'ITEMS_ONLY',
      shippingAddress, trackingState: null, reservationStatus: 'ACTIVE',
      reservationExpiresAt: Timestamp.fromMillis(now.toMillis() + RESERVATION_MINUTES * 60_000),
      statusHistory: [{ status: 'CREATED', at: now }, { status: 'PAYMENT_PENDING', at: now }],
      itemsPreview: items.map(({ title, imageUrl, quantity }) => ({ title, imageUrl, quantity })), createdAt: now, updatedAt: now }
    tx.create(orderRef, order)
    tx.create(requestRef, { buyerId, orderId: orderRef.id, fingerprint, createdAt: now })
    items.forEach(({ reservedAfter, ...item }, index) => {
      tx.create(orderRef.collection('items').doc(item.artworkId), item)
      tx.update(artworkRefs[index], { reservedCount: reservedAfter, updatedAt: now })
      tx.delete(cartRefs[index])
    })
    return receipt(orderRef.id, order)
  })
}

export async function handleSetArtworkInventory(request: CallableRequest<unknown>, suppliedDb?: Firestore) {
  const sellerId = requireCommerceRole(request, ['SELLER'])
  const input = object(request.data), artworkId = id(input.artworkId, 'artwork ID')
  const physical = input.inventoryCount
  if (!Number.isSafeInteger(physical) || (physical as number) < 0) throw new HttpsError('invalid-argument', 'Stock must be a non-negative safe integer.')
  const db = suppliedDb ?? getFirestore(), ref = db.doc(`artworks/${artworkId}`)
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref), data = snapshot.data()
    if (!data || data.sellerId !== sellerId) throw new HttpsError('permission-denied', 'Only the artwork owner can adjust stock.')
    if (!['DRAFT', 'PUBLISHED', 'REJECTED', 'SUSPENDED'].includes(data.status)) fail('Stock cannot change while the artwork awaits review.')
    const current = inventory(data)
    if ((physical as number) < current.reserved) fail(`Stock cannot be lower than the ${current.reserved} units reserved by unpaid orders.`)
    if (physical !== current.physical) tx.update(ref, { inventoryCount: physical, reservedCount: current.reserved, updatedAt: Timestamp.now() })
    return { inventoryCount: physical, reservedCount: current.reserved, availableCount: (physical as number) - current.reserved }
  })
}

/** Repeat-safe trusted operation. Never uses TTL deletion as business logic. */
export async function releaseExpiredOrder(db: Firestore, orderId: string, now = Timestamp.now()): Promise<boolean> {
  const orderRef = db.collection('orders').doc(orderId)
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(orderRef), order = snapshot.data()
    if (!order || order.reservationStatus !== 'ACTIVE' || order.status !== 'PAYMENT_PENDING' || order.paymentState !== 'PENDING' || !(order.reservationExpiresAt instanceof Timestamp) || order.reservationExpiresAt.toMillis() > now.toMillis()) return false
    const items = await tx.get(orderRef.collection('items'))
    if (!items.size || items.size > MAX_LINES) fail('Reservation items need operator review.')
    const artworkRefs = items.docs.map((item) => db.doc(`artworks/${id(item.get('artworkId'), 'artwork ID')}`))
    const artworks = await tx.getAll(...artworkRefs)
    const counts = items.docs.map((item, index) => {
      const data = artworks[index].data(), quantity = item.get('quantity')
      if (!data || !Number.isSafeInteger(quantity) || quantity < 1) fail('Reservation inventory needs operator review.')
      const stock = inventory(data)
      if (stock.reserved < quantity) fail('Reservation inventory is inconsistent; nothing was released.')
      return stock.reserved - quantity
    })
    artworkRefs.forEach((ref, index) => tx.update(ref, { reservedCount: counts[index], updatedAt: now }))
    tx.update(orderRef, { status: 'CANCELLED', cancellationReason: 'RESERVATION_EXPIRED', reservationStatus: 'RELEASED', reservationReleasedAt: now,
      updatedAt: now, statusHistory: [...order.statusHistory, { status: 'CANCELLED', at: now }] })
    return true
  })
}
export async function handleExpireCheckoutReservations(request: CallableRequest<unknown>, suppliedDb?: Firestore) {
  requireCommerceRole(request, ['ADMIN', 'SUPER_ADMIN'])
  return expireDueReservations(suppliedDb ?? getFirestore())
}
export async function expireDueReservations(db: Firestore) {
  const now = Timestamp.now()
  const due = await db.collection('orders').where('reservationStatus', '==', 'ACTIVE').where('reservationExpiresAt', '<=', now).orderBy('reservationExpiresAt').limit(50).get()
  let released = 0
  for (const order of due.docs) if (await releaseExpiredOrder(db, order.id, now)) released++
  return { examined: due.size, released, mayHaveMore: due.size === 50 }
}
async function safe<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation() } catch (error) {
    if (error instanceof HttpsError) throw error
    logger.error('Commerce operation failed', error)
    throw new HttpsError('internal', 'The operation could not be confirmed. Retry the same request.')
  }
}
export const createCheckoutOrder = onCall((request) => safe(() => handleCreateCheckoutOrder(request)))
export const setArtworkInventory = onCall((request) => safe(() => handleSetArtworkInventory(request)))
export const expireCheckoutReservations = onCall((request) => safe(() => handleExpireCheckoutReservations(request)))
