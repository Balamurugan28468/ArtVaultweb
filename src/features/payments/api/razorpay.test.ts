import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const invoke = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ functions: { invoke } }) }))
import { loadRazorpay, openTestCheckout, reconcileTestPayment, startTestPayment, testPaymentsAvailable, verifyTestPayment } from './razorpay'
const session = { mode: 'TEST' as const, paymentId: 'payment-local-id', keyId: 'rzp_test_fixture', providerOrderId: 'order_fixture', amount: 10000, currency: 'INR' as const }
beforeEach(() => { invoke.mockReset() })
afterEach(() => { delete window.Razorpay; vi.restoreAllMocks() })

describe('Razorpay browser boundary', () => {
  it('sends only the order ID for payment initiation', async () => {
    invoke.mockResolvedValue({ data: session, error: null })
    expect(await startTestPayment('order-local-id')).toEqual(session)
    expect(invoke).toHaveBeenCalledWith('razorpay-test', { body: { action: 'start', orderId: 'order-local-id' } })
  })
  it.each([{ keyId: 'rzp_live_no' }, { mode: 'LIVE' }, { amount: 1 }, { currency: 'USD' }, { providerOrderId: 'bad' }])('rejects unsafe checkout configuration %j', async override => {
    invoke.mockResolvedValue({ data: { ...session, ...override }, error: null })
    await expect(startTestPayment('order')).rejects.toThrow('configuration is invalid')
  })
  it('does not treat a frontend callback as payment success', async () => {
    invoke.mockResolvedValue({ data: { mode: 'TEST', status: 'PROCESSING' }, error: null })
    const callback = { razorpay_order_id: 'order_fixture', razorpay_payment_id: 'pay_fixture', razorpay_signature: 'signature-fixture' }
    expect(await verifyTestPayment(session.paymentId, callback)).toBe('PROCESSING')
    expect(invoke).toHaveBeenCalledWith('razorpay-test', { body: { action: 'verify', paymentId: session.paymentId, ...callback } })
  })
  it('surfaces only server-confirmed success', async () => {
    invoke.mockResolvedValue({ data: { mode: 'TEST', status: 'SUCCEEDED' }, error: null })
    expect(await reconcileTestPayment('order')).toBe('SUCCEEDED')
  })
  it('rejects malformed status and suppresses upstream sensitive errors', async () => {
    invoke.mockResolvedValueOnce({ data: { mode: 'TEST', status: 'anything' }, error: null })
    await expect(reconcileTestPayment('order')).rejects.toThrow('status is unavailable')
    invoke.mockResolvedValueOnce({ data: null, error: new Error('private upstream details') })
    await expect(reconcileTestPayment('order')).rejects.toThrow('Check its status')
  })
  it('fails closed when the Edge Function is not configured or unreachable', async () => {
    invoke.mockRejectedValue(new Error('offline'))
    expect(await testPaymentsAvailable()).toBe(false)
  })
  it('launches only provider test checkout and returns a cleanup function', async () => {
    const open = vi.fn(), close = vi.fn(), on = vi.fn()
    const constructor = vi.fn()
    window.Razorpay = class {
      constructor(options: unknown) { constructor(options) }
      open = open; close = close; on = on
    }
    await loadRazorpay()
    const events = { result: vi.fn(), dismiss: vi.fn(), failed: vi.fn() }
    const dispose = openTestCheckout(session, events)
    expect(constructor).toHaveBeenCalledWith(expect.objectContaining({ key: session.keyId, amount: session.amount, order_id: session.providerOrderId, handler: events.result }))
    expect(on).toHaveBeenCalledWith('payment.failed', events.failed)
    expect(open).toHaveBeenCalledOnce()
    dispose()
    expect(close).toHaveBeenCalledOnce()
  })
  it('removes a failed SDK script and retries a single shared load without network access', async () => {
    const append = vi.spyOn(document.head, 'appendChild').mockImplementation(node => {
      queueMicrotask(() => node.dispatchEvent(new Event('error')))
      return node
    })
    await expect(loadRazorpay()).rejects.toThrow('could not load')
    append.mockImplementation(node => {
      expect((node as HTMLScriptElement).src).toBe('https://checkout.razorpay.com/v1/checkout.js')
      queueMicrotask(() => {
        window.Razorpay = class { open() {} close() {} on() {} }
        node.dispatchEvent(new Event('load'))
      })
      return node
    })
    const retry = loadRazorpay()
    expect(loadRazorpay()).toBe(retry)
    await expect(retry).resolves.toBeUndefined()
    expect(append).toHaveBeenCalledTimes(2)
  })
})
