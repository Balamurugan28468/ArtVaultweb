import { readFileSync } from 'node:fs'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertIsolatedFirestoreTestEnvironment, TEST_PROJECT_ID } from '../../test-support/emulatorTestEnv'
import { handleCreateCheckoutOrder, handleSetArtworkInventory, handleExpireCheckoutReservations, releaseExpiredOrder } from '../src/commerce'

let environment: RulesTestEnvironment, db: Firestore
let app: ReturnType<typeof initializeApp>
const address = { fullName: 'Test Buyer', addressLine1: '10 Test Street', addressLine2: '', city: 'Chennai', state: 'Tamil Nadu', postalCode: '600001', country: 'India', phone: '', isDefault: false }
const request = (uid: string, data: unknown, role = 'CUSTOMER') => ({ auth: { uid, token: { role } }, data }) as CallableRequest<unknown>
const checkout = (uid = 'buyer', key = 'checkout-request-123456', extra = {}) => request(uid, { artworkIds: ['art1'], addressId: 'home', idempotencyKey: key, ...extra })
const create = (input = checkout()) => handleCreateCheckoutOrder(input, db)
async function seedBuyer(uid: string, quantity = 1) {
  const batch = db.batch()
  batch.set(db.doc(`addresses/${uid}/entries/home`), address)
  batch.set(db.doc(`carts/${uid}/items/art1`), { quantity, addedAt: Timestamp.now() })
  await batch.commit()
}
beforeAll(async () => {
  const { host, port } = assertIsolatedFirestoreTestEnvironment()
  if (!['127.0.0.1', 'localhost'].includes(host) || port !== 8280) throw new Error('Commerce tests require the disposable 8280 emulator, never owner data.')
  environment = await initializeTestEnvironment({ projectId: TEST_PROJECT_ID, firestore: { host, port, rules: readFileSync('firestore.rules', 'utf8') } })
  app = initializeApp({ projectId: TEST_PROJECT_ID }, 'commerce-integration')
  db = getFirestore(app)
})
afterAll(async () => { await environment?.cleanup(); if (app) await deleteApp(app) })
beforeEach(async () => {
  await environment.clearFirestore()
  await db.doc('artworks/art1').set({ sellerId: 'seller1', title: 'Original painting', description: 'A real test fixture artwork.', price: 12500, category: 'painting', tags: [], images: [], inventoryCount: 2, status: 'PUBLISHED', createdAt: Timestamp.now(), updatedAt: Timestamp.now() })
  await seedBuyer('buyer')
})

describe('trusted checkout on real Firestore transactions', () => {
  it('creates one multi-seller unpaid order using server prices and snapshots; removes only included cart lines', async () => {
    await db.doc('artworks/art2').set({ sellerId: 'seller2', title: 'Second work', price: 5000, images: [], inventoryCount: 1, status: 'PUBLISHED' })
    await db.doc('carts/buyer/items/art1').update({ quantity: 2 })
    await db.doc('carts/buyer/items/art2').set({ quantity: 1 })
    await db.doc('carts/buyer/items/unselected').set({ quantity: 3 })
    const result = await create(checkout('buyer', undefined, { artworkIds: ['art2', 'art1'], price: 1, total: 1, paymentState: 'PAID', currency: 'USD', quantity: 99 }))
    expect(result).toMatchObject({ amount: 30000, currency: 'INR', status: 'PAYMENT_PENDING', pricingState: 'ITEMS_ONLY' })
    const order = (await db.doc(`orders/${result.orderId}`).get()).data()!
    expect(order).toMatchObject({ buyerId: 'buyer', paymentState: 'PENDING', shippingCost: null, taxCost: null, total: 30000, reservationStatus: 'ACTIVE', shippingAddress: { fullName: 'Test Buyer' } })
    expect(order.reservationExpiresAt.toMillis() - order.createdAt.toMillis()).toBe(30 * 60_000)
    const items = await db.collection(`orders/${result.orderId}/items`).get()
    expect(items.docs.map((item) => item.get('sellerId')).sort()).toEqual(['seller1', 'seller2'])
    expect(items.docs.find((item) => item.id === 'art1')!.data()).toMatchObject({ artworkId: 'art1', title: 'Original painting', unitPrice: 12500, quantity: 2, subtotal: 25000 })
    expect((await db.doc('artworks/art1').get()).data()).toMatchObject({ inventoryCount: 2, reservedCount: 2 })
    expect((await db.collection('carts/buyer/items').get()).docs.map((item) => item.id)).toEqual(['unselected'])
    await db.doc('artworks/art1').update({ price: 90000, title: 'Edited later' })
    await db.doc('addresses/buyer/entries/home').update({ fullName: 'Changed later' })
    expect((await db.doc(`orders/${result.orderId}/items/art1`).get()).get('unitPrice')).toBe(12500)
    expect((await db.doc(`orders/${result.orderId}`).get()).get('shippingAddress.fullName')).toBe('Test Buyer')
  })
  it.each(['DRAFT', 'SUBMITTED', 'REJECTED', 'SUSPENDED', 'SOLD'])('rejects %s without changing stock or cart', async (status) => {
    await db.doc('artworks/art1').update({ status })
    await expect(create()).rejects.toMatchObject({ code: 'failed-precondition' })
    expect((await db.collection('orders').get()).size).toBe(0)
    expect((await db.doc('carts/buyer/items/art1').get()).exists).toBe(true)
    expect((await db.doc('artworks/art1').get()).get('reservedCount')).toBeUndefined()
  })
  it('rejects forged identity and another buyer’s address', async () => {
    await seedBuyer('other')
    await expect(create(checkout('buyer', undefined, { buyerId: 'other' }))).rejects.toMatchObject({ code: 'invalid-argument' })
    await db.doc('addresses/other/entries/foreign').set(address)
    await expect(create(checkout('buyer', undefined, { addressId: 'foreign' }))).rejects.toMatchObject({ code: 'permission-denied' })
    expect((await db.collection('orders').get()).size).toBe(0)
  })
  it('rejects insufficient inventory and keeps every cart/stock write atomic', async () => {
    await db.doc('carts/buyer/items/art1').update({ quantity: 3 })
    await expect(create()).rejects.toMatchObject({ code: 'failed-precondition' })
    expect((await db.doc('artworks/art1').get()).get('inventoryCount')).toBe(2)
    expect((await db.doc('artworks/art1').get()).get('reservedCount')).toBeUndefined()
    expect((await db.doc('carts/buyer/items/art1').get()).get('quantity')).toBe(3)
    expect((await db.collection('checkoutRequests').get()).size).toBe(0)
  })
  it('allows exactly one competing buyer to reserve the last unit', async () => {
    await db.doc('artworks/art1').update({ inventoryCount: 1 })
    await seedBuyer('other')
    const results = await Promise.allSettled([create(checkout('buyer')), create(checkout('other'))])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect((await db.collection('orders').get()).size).toBe(1)
    expect((await db.doc('artworks/art1').get()).data()).toMatchObject({ inventoryCount: 1, reservedCount: 1 })
    const loser = results[0].status === 'rejected' ? 'buyer' : 'other'
    expect((await db.doc(`carts/${loser}/items/art1`).get()).get('quantity')).toBe(1)
  })
  it('deduplicates simultaneous requests and replay does not remove a newly added cart line', async () => {
    const results = await Promise.all([create(), create()])
    expect(results[0].orderId).toBe(results[1].orderId)
    expect((await db.doc('artworks/art1').get()).get('reservedCount')).toBe(1)
    await db.doc('carts/buyer/items/art1').set({ quantity: 1 })
    expect((await create()).orderId).toBe(results[0].orderId)
    expect((await db.doc('carts/buyer/items/art1').get()).exists).toBe(true)
    expect((await db.collection('orders').get()).size).toBe(1)
    await expect(create(checkout('buyer', undefined, { addressId: 'changed' }))).rejects.toMatchObject({ code: 'already-exists' })
  })
  it('rejects self-purchase and an empty/missing cart item', async () => {
    await db.doc('artworks/art1').update({ sellerId: 'buyer' })
    await expect(create()).rejects.toMatchObject({ code: 'failed-precondition' })
    await db.doc('carts/buyer/items/art1').delete()
    await expect(create()).rejects.toMatchObject({ code: 'failed-precondition' })
  })
  it('prevents a seller lowering stock below reservations or changing another seller’s stock', async () => {
    await create()
    await expect(handleSetArtworkInventory(request('intruder', { artworkId: 'art1', inventoryCount: 0 }, 'SELLER'), db)).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(handleSetArtworkInventory(request('seller1', { artworkId: 'art1', inventoryCount: 0 }, 'SELLER'), db)).rejects.toMatchObject({ code: 'failed-precondition' })
    await expect(handleSetArtworkInventory(request('seller1', { artworkId: 'art1', inventoryCount: 3 }, 'SELLER'), db)).resolves.toEqual({ inventoryCount: 3, reservedCount: 1, availableCount: 2 })
  })
  it('keeps stock valid when a checkout races a seller adjustment to zero', async () => {
    await db.doc('artworks/art1').update({ inventoryCount: 1 })
    const results = await Promise.allSettled([create(), handleSetArtworkInventory(request('seller1', { artworkId: 'art1', inventoryCount: 0 }, 'SELLER'), db)])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const data = (await db.doc('artworks/art1').get()).data()!
    expect(data.inventoryCount).toBeGreaterThanOrEqual(data.reservedCount ?? 0)
  })
  it('releases expired reservations exactly once under concurrent expiry calls and preserves the order', async () => {
    const result = await create(), future = Timestamp.fromMillis(result.reservationExpiresAt + 1)
    expect(await releaseExpiredOrder(db, result.orderId, Timestamp.fromMillis(result.reservationExpiresAt - 1))).toBe(false)
    expect((await Promise.all([releaseExpiredOrder(db, result.orderId, future), releaseExpiredOrder(db, result.orderId, future)])).filter(Boolean)).toHaveLength(1)
    expect(await releaseExpiredOrder(db, result.orderId, future)).toBe(false)
    expect((await db.doc('artworks/art1').get()).data()).toMatchObject({ inventoryCount: 2, reservedCount: 0 })
    expect((await db.doc(`orders/${result.orderId}`).get()).data()).toMatchObject({ status: 'CANCELLED', paymentState: 'PENDING', reservationStatus: 'RELEASED', cancellationReason: 'RESERVATION_EXPIRED' })
    expect((await create()).status).toBe('CANCELLED')
    expect((await db.doc(`orders/${result.orderId}/items/art1`).get()).exists).toBe(true)
  })
  it('never releases a paid order and requires admin authorization for the expiry callable', async () => {
    const result = await create()
    await db.doc(`orders/${result.orderId}`).update({ paymentState: 'PAID', status: 'PAID', reservationExpiresAt: Timestamp.fromMillis(1) })
    expect(await releaseExpiredOrder(db, result.orderId)).toBe(false)
    await expect(handleExpireCheckoutReservations(request('buyer', {}), db)).rejects.toMatchObject({ code: 'permission-denied' })
    expect((await handleExpireCheckoutReservations(request('admin', {}, 'ADMIN'), db)).released).toBe(0)
    expect((await db.doc('artworks/art1').get()).get('reservedCount')).toBe(1)
  })
  it('retains buyer privacy, denies authoritative client writes, and protects reserved artwork deletion', async () => {
    const result = await create()
    const buyer = environment.authenticatedContext('buyer', { role: 'CUSTOMER' }).firestore()
    const other = environment.authenticatedContext('other', { role: 'SELLER' }).firestore()
    const seller = environment.authenticatedContext('seller1', { role: 'SELLER' }).firestore()
    await assertSucceeds(getDoc(doc(buyer, `orders/${result.orderId}`)))
    await assertFails(getDoc(doc(other, `orders/${result.orderId}`)))
    await assertFails(getDoc(doc(seller, `orders/${result.orderId}/items/art1`)))
    await assertFails(updateDoc(doc(buyer, `orders/${result.orderId}`), { paymentState: 'PAID' }))
    await assertFails(setDoc(doc(buyer, 'orders/forged'), { buyerId: 'buyer', status: 'PAID' }))
    await assertFails(getDoc(doc(buyer, `checkoutRequests/${result.orderId}`)))
    await assertFails(updateDoc(doc(seller, 'artworks/art1'), { inventoryCount: 0, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(seller, 'artworks/art1'), { reservedCount: 0, updatedAt: serverTimestamp() }))
    await assertFails(deleteDoc(doc(seller, 'artworks/art1')))
    await assertFails(updateDoc(doc(other, 'artworks/art1'), { inventoryCount: 3, updatedAt: serverTimestamp() }))
    await db.doc('carts/buyer/items/art1').set({ quantity: 1 })
    await assertFails(deleteDoc(doc(other, 'carts/buyer/items/art1')))
  })
})
