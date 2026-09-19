import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCheckoutOrder } from './useCheckoutOrder'

const { createCheckoutOrder, navigate } = vi.hoisted(() => ({ createCheckoutOrder: vi.fn(), navigate: vi.fn() }))
vi.mock('../api/checkoutOrder', () => ({ createCheckoutOrder }))
vi.mock('react-router', () => ({ useNavigate: () => navigate }))
beforeEach(() => { sessionStorage.clear(); vi.clearAllMocks(); createCheckoutOrder.mockResolvedValue({ orderId: 'trusted-order' }) })
afterEach(() => vi.restoreAllMocks())
describe('trusted checkout recovery', () => {
  it('does not send a request when its retry identity cannot be retained', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked') })
    const { result } = renderHook(() => useCheckoutOrder('buyer'))
    await act(async () => result.current.submit(['art1'], 'home'))
    expect(createCheckoutOrder).not.toHaveBeenCalled()
    expect(result.current.pending).toBe(false)
    expect(result.current.error).toMatch(/Enable browser session storage/)
  })
  it('submits IDs only, retains a retry key and navigates to the existing confirmation route', async () => {
    const { result } = renderHook(() => useCheckoutOrder('buyer'))
    await act(async () => result.current.submit(['art1'], 'home'))
    expect(createCheckoutOrder).toHaveBeenCalledWith({ artworkIds: ['art1'], addressId: 'home', idempotencyKey: expect.any(String) })
    expect(navigate).toHaveBeenCalledWith('/checkout/confirmation/trusted-order')
    expect(sessionStorage.getItem('artvault:pending-checkout:buyer')).toBeNull()
  })
  it('recovers a lost response after remount using exactly the same key and IDs', async () => {
    createCheckoutOrder.mockRejectedValueOnce({ code: 'functions/unavailable' })
    const first = renderHook(() => useCheckoutOrder('buyer'))
    await act(async () => first.result.current.submit(['art1'], 'home'))
    const original = createCheckoutOrder.mock.calls[0][0]
    expect(first.result.current.unresolved).toEqual(original)
    expect(navigate).not.toHaveBeenCalled()
    first.unmount()
    const second = renderHook(() => useCheckoutOrder('buyer'))
    await act(async () => second.result.current.retry())
    expect(createCheckoutOrder.mock.calls[1][0]).toEqual(original)
    expect(navigate).toHaveBeenCalledWith('/checkout/confirmation/trusted-order')
  })
  it('does not submit twice on rapid repeated clicks', async () => {
    let resolve!: (result: { orderId: string }) => void
    createCheckoutOrder.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const { result } = renderHook(() => useCheckoutOrder('buyer'))
    await act(async () => { void result.current.submit(['art1'], 'home'); void result.current.submit(['art1'], 'home') })
    expect(createCheckoutOrder).toHaveBeenCalledOnce()
    await act(async () => resolve({ orderId: 'trusted-order' }))
  })
  it('shows a definite rejection without navigation or retaining an unusable request', async () => {
    createCheckoutOrder.mockRejectedValueOnce({ code: 'functions/failed-precondition', message: 'Not enough available stock.' })
    const { result } = renderHook(() => useCheckoutOrder('buyer'))
    await act(async () => result.current.submit(['art1'], 'home'))
    expect(result.current.error).toBe('Not enough available stock.')
    expect(result.current.unresolved).toBeNull()
    expect(navigate).not.toHaveBeenCalled()
  })
  it('never reuses another buyer’s pending checkout', async () => {
    createCheckoutOrder.mockRejectedValueOnce({ code: 'functions/unavailable' })
    const first = renderHook(() => useCheckoutOrder('buyer'))
    await act(async () => first.result.current.submit(['art1'], 'home'))
    first.unmount()
    expect(renderHook(() => useCheckoutOrder('other')).result.current.unresolved).toBeNull()
  })
})
