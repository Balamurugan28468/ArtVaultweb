import { describe, expect, it, vi } from 'vitest'
const { invoke, httpsCallable } = vi.hoisted(() => {
  const invoke = vi.fn()
  return { invoke, httpsCallable: vi.fn(() => invoke) }
})
vi.mock('firebase/functions', () => ({ httpsCallable }))
vi.mock('@/lib/firebase/config', () => ({ functions: 'EXISTING_FUNCTIONS' }))
const { createCheckoutOrder } = await import('./checkoutOrder')

describe('checkout callable client', () => {
  it('uses the existing Firebase Functions instance and returns only the server receipt', async () => {
    const request = { artworkIds: ['a1'], addressId: 'saved', idempotencyKey: 'request-123456789' }
    const receipt = { orderId: 'trusted', amount: 12599, currency: 'INR', status: 'PAYMENT_PENDING', pricingState: 'ITEMS_ONLY', reservationExpiresAt: 1000 }
    invoke.mockResolvedValueOnce({ data: receipt })
    expect(await createCheckoutOrder(request)).toEqual(receipt)
    expect(httpsCallable).toHaveBeenCalledWith('EXISTING_FUNCTIONS', 'createCheckoutOrder')
    expect(invoke).toHaveBeenCalledWith(request)
  })
  it('propagates failure instead of generating an order or success locally', async () => {
    invoke.mockRejectedValueOnce({ code: 'functions/unavailable' })
    await expect(createCheckoutOrder({ artworkIds: ['a1'], addressId: 'saved', idempotencyKey: 'request-123456789' })).rejects.toEqual({ code: 'functions/unavailable' })
  })
})
