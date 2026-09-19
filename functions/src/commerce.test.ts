import { describe, expect, it } from 'vitest'
import type { CallableRequest } from 'firebase-functions/v2/https'
import { addressSnapshot, handleCreateCheckoutOrder, handleExpireCheckoutReservations, handleSetArtworkInventory, inventory, parseCheckoutInput, requireCommerceRole } from './commerce'

const input = { artworkIds: ['b', 'a'], addressId: 'home', idempotencyKey: 'test-key-123456789' }
const request = (role?: string, data: unknown = input) => ({ data, auth: role ? { uid: 'buyer', token: { role } } : undefined }) as CallableRequest<unknown>
describe('commerce callable boundary', () => {
  it.each([handleCreateCheckoutOrder, handleSetArtworkInventory, handleExpireCheckoutReservations])('rejects signed-out callers before accessing Firestore', async (handler) => {
    await expect(handler(request())).rejects.toMatchObject({ code: 'unauthenticated' })
  })
  it.each(['ADMIN', 'SUPER_ADMIN', 'UNKNOWN'])('rejects %s as a buyer', async (role) => {
    await expect(handleCreateCheckoutOrder(request(role))).rejects.toMatchObject({ code: 'permission-denied' })
  })
  it.each(['CUSTOMER', 'SELLER'])('uses the verified %s UID only', (role) => {
    expect(requireCommerceRole(request(role), ['CUSTOMER', 'SELLER'])).toBe('buyer')
  })
  it.each(['uid', 'buyerId', 'userId'])('rejects forged %s', (field) => {
    expect(() => parseCheckoutInput({ ...input, [field]: 'victim' })).toThrow('authentication')
  })
  it('does not accept client price, quantity, currency or payment state as authority', () => {
    expect(parseCheckoutInput({ ...input, price: 1, total: 1, quantity: 99, currency: 'USD', paymentState: 'PAID' })).toEqual({ ...input, artworkIds: ['a', 'b'] })
  })
  it.each([{ artworkIds: [] }, { artworkIds: ['a', 'a'] }, { artworkIds: ['../victim'] }, { artworkIds: Array.from({ length: 51 }, (_, i) => `a${i}`) }, { addressId: '../other' }, { idempotencyKey: 'short' }])('rejects malformed checkout input %j', (change) => {
    expect(() => parseCheckoutInput({ ...input, ...change })).toThrow()
  })
  it('keeps physical, reserved and available quantities distinct for legacy and managed inventory', () => {
    expect(inventory({ inventoryCount: 4 })).toEqual({ physical: 4, reserved: 0, available: 4 })
    expect(inventory({ inventoryCount: 4, reservedCount: 3 })).toEqual({ physical: 4, reserved: 3, available: 1 })
    expect(() => inventory({ inventoryCount: 1, reservedCount: 2 })).toThrow()
  })
  it('revalidates saved address data, which existing rules only shape-check', () => {
    expect(() => addressSnapshot(undefined)).toThrow('your account')
    expect(() => addressSnapshot({ fullName: '' })).toThrow('Complete')
  })
  it('rejects a buyer invoking stock adjustment or expiry', async () => {
    await expect(handleSetArtworkInventory(request('CUSTOMER'))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(handleExpireCheckoutReservations(request('SELLER'))).rejects.toMatchObject({ code: 'permission-denied' })
  })
})
