import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CheckoutRejectedError, createCheckoutOrder } from './checkoutOrder'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
const request = { artworkIds: ['a1'], addressId: 'saved', idempotencyKey: 'request-123456789' }
beforeEach(() => { rpc.mockReset() })

describe('checkout Supabase RPC client', () => {
  it('sends IDs only and returns the trusted server receipt', async () => {
    const receipt = { orderId: 'trusted', amount: 12599, currency: 'INR', status: 'PAYMENT_PENDING', pricingState: 'ITEMS_ONLY', reservationExpiresAt: 1000 }
    rpc.mockResolvedValue({ data: receipt, error: null })
    await expect(createCheckoutOrder({ ...request, price: 1, role: 'ADMIN' } as typeof request)).resolves.toEqual(receipt)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('create_checkout_order', {
      artwork_ids: ['a1'], address_id: 'saved', idempotency_key: 'request-123456789',
    })
  })
  it.each(['22023', '42501', '22P02', 'PGRST301', 'PGRST302', 'PGRST303'])(
    'recognizes a definite rejection (%s) so the buyer can correct checkout', async (code) => {
      rpc.mockResolvedValue({ data: null, error: { code, message: 'Insufficient inventory' } })
      await expect(createCheckoutOrder(request)).rejects.toBeInstanceOf(CheckoutRejectedError)
    },
  )
  it('preserves the database validation explanation', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'Insufficient inventory' } })
    await expect(createCheckoutOrder(request)).rejects.toThrow('Insufficient inventory')
  })
  it.each([
    ['22023', 'Insufficient inventory', true],
    ['42501', 'Saved address not found', true],
    ['42501', 'Buyer authentication required', false],
    ['22023', 'Idempotency key was already used for another request', false],
  ])('only post-idempotency checks rule out a prior order: %s / %s', async (code, message, previousOrderExcluded) => {
    rpc.mockResolvedValue({ data: null, error: { code, message } })
    await expect(createCheckoutOrder(request)).rejects.toMatchObject({ previousOrderExcluded })
  })
  it.each(['57014', 'XX000', ''])('keeps an ambiguous failure (%s) recoverable without leaking server details', async (code) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: 'internal database detail' } })
    const error = await createCheckoutOrder(request).catch((cause: unknown) => cause)
    expect(error).not.toBeInstanceOf(CheckoutRejectedError)
    expect(error).not.toHaveProperty('message', 'internal database detail')
  })
  it('propagates a transport failure instead of creating a local success', async () => {
    const error = new TypeError('Failed to fetch')
    rpc.mockRejectedValue(error)
    await expect(createCheckoutOrder(request)).rejects.toThrow('Failed to fetch')
  })
  it.each([null, {}, { orderId: 'order' }])('rejects an incomplete receipt without clearing recovery identity', async (data) => {
    rpc.mockResolvedValue({ data, error: null })
    await expect(createCheckoutOrder(request)).rejects.toMatchObject({ code: 'unknown' })
  })
})
