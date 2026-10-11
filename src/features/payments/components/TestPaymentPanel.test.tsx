import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { Timestamp } from '@/lib/supabase/timestamp'
import type { Order } from '@/features/orders/types'
const mocks = vi.hoisted(() => ({
  env: { VITE_ENABLE_RAZORPAY_TEST: true },
  testPaymentsAvailable: vi.fn(), loadRazorpay: vi.fn(), startTestPayment: vi.fn(),
  openTestCheckout: vi.fn(), verifyTestPayment: vi.fn(), reconcileTestPayment: vi.fn(),
}))
vi.mock('@/config/env', () => ({ env: mocks.env }))
vi.mock('../api/razorpay', () => mocks)
import { TestPaymentPanel } from './TestPaymentPanel'
const order = { id: 'order', status: 'PAYMENT_PENDING', paymentState: 'PENDING', reservationStatus: 'ACTIVE', reservationExpiresAt: Timestamp.fromDate(new Date('2050-01-01')) } as Order
afterEach(() => vi.useRealTimers())
const callback = { razorpay_payment_id: 'pay_test', razorpay_order_id: 'order_test', razorpay_signature: 'fixture' }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.env.VITE_ENABLE_RAZORPAY_TEST = true
  mocks.testPaymentsAvailable.mockResolvedValue(true)
  mocks.loadRazorpay.mockResolvedValue(undefined)
  mocks.startTestPayment.mockResolvedValue({ paymentId: 'local-payment' })
  mocks.openTestCheckout.mockReturnValue(vi.fn())
  mocks.verifyTestPayment.mockResolvedValue('SUCCEEDED')
})
async function launch() {
  fireEvent.click(await screen.findByRole('button', { name: 'Pay with Razorpay Test' }))
  await waitFor(() => expect(mocks.openTestCheckout).toHaveBeenCalledOnce())
  return mocks.openTestCheckout.mock.calls[0][1] as { result(v: typeof callback): void; dismiss(): void; failed(): void }
}
describe('TestPaymentPanel', () => {
  it('does not invite payment for an expired but not yet released reservation', async () => {
    render(<TestPaymentPanel order={{ ...order, reservationExpiresAt: Timestamp.fromMillis(1) }} onConfirmed={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('payment window expired')
    expect(screen.queryByRole('button', { name: 'Pay with Razorpay Test' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check payment status' })).not.toBeInTheDocument()
    expect(mocks.startTestPayment).not.toHaveBeenCalled()
  })
  it('preserves expired history and offers marketplace navigation after release', () => {
    render(<MemoryRouter><TestPaymentPanel order={{ ...order, status: 'CANCELLED', reservationStatus: 'RELEASED', cancellationReason: 'RESERVATION_EXPIRED' }} onConfirmed={vi.fn()} /></MemoryRouter>)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/explore')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('withdraws Pay when the stored deadline passes while the page remains open', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01'))
    render(<TestPaymentPanel order={{ ...order, reservationExpiresAt: Timestamp.fromMillis(Date.now() + 2000) }} onConfirmed={vi.fn()} />)
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Pay with Razorpay Test' })).toBeEnabled()
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.queryByRole('button', { name: 'Pay with Razorpay Test' })).not.toBeInTheDocument()
    expect(mocks.startTestPayment).not.toHaveBeenCalled()
  })
  it('fails closed when reservation display facts are missing', async () => {
    render(<TestPaymentPanel order={{ ...order, reservationExpiresAt: undefined }} onConfirmed={vi.fn()} />)
    expect(await screen.findByRole('button', { name: 'Pay with Razorpay Test' })).toBeDisabled()
  })
  it('does not contact the backend or offer payment when the opt-in is off', () => {
    mocks.env.VITE_ENABLE_RAZORPAY_TEST = false
    render(<TestPaymentPanel order={order} onConfirmed={vi.fn()} />)
    expect(mocks.testPaymentsAvailable).not.toHaveBeenCalled()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/not configured/)).toBeInTheDocument()
  })
  it('requires server readiness as well as the frontend flag', async () => {
    mocks.testPaymentsAvailable.mockResolvedValue(false)
    render(<TestPaymentPanel order={order} onConfirmed={vi.fn()} />)
    await waitFor(() => expect(mocks.testPaymentsAvailable).toHaveBeenCalledOnce())
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('refreshes stored order only after server verification succeeds', async () => {
    const confirmed = vi.fn()
    render(<TestPaymentPanel order={order} onConfirmed={confirmed} />)
    const events = await launch()
    expect(confirmed).not.toHaveBeenCalled()
    await act(async () => events.result(callback))
    expect(mocks.verifyTestPayment).toHaveBeenCalledWith('local-payment', callback)
    expect(confirmed).toHaveBeenCalledOnce()
  })
  it('verification failure is never presented as success', async () => {
    mocks.verifyTestPayment.mockRejectedValue(new Error('Verification unavailable'))
    const confirmed = vi.fn()
    render(<TestPaymentPanel order={order} onConfirmed={confirmed} />)
    const events = await launch()
    await act(async () => events.result(callback))
    expect(confirmed).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Verification unavailable')
  })
  it('modal dismissal neither settles payment nor releases inventory', async () => {
    const confirmed = vi.fn()
    render(<TestPaymentPanel order={order} onConfirmed={confirmed} />)
    const events = await launch()
    act(() => events.dismiss())
    expect(mocks.verifyTestPayment).not.toHaveBeenCalled()
    expect(confirmed).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('No payment success was assumed')
  })
  it('handles failed attempts and suppresses duplicate result callbacks', async () => {
    render(<TestPaymentPanel order={order} onConfirmed={vi.fn()} />)
    const events = await launch()
    act(() => events.failed())
    expect(screen.getByRole('status')).toHaveTextContent('attempt failed')
    await act(async () => { events.result(callback); events.result(callback) })
    expect(mocks.verifyTestPayment).toHaveBeenCalledOnce()
  })
  it('checks server status after refresh without a new checkout', async () => {
    mocks.reconcileTestPayment.mockResolvedValue('PROCESSING')
    const confirmed = vi.fn()
    render(<TestPaymentPanel order={order} onConfirmed={confirmed} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Check payment status' }))
    await screen.findByText(/still pending verification/)
    expect(mocks.reconcileTestPayment).toHaveBeenCalledWith('order')
    expect(mocks.startTestPayment).not.toHaveBeenCalled()
    expect(confirmed).not.toHaveBeenCalled()
  })
  it('closes the provider modal and ignores callbacks after unmount', async () => {
    const confirmed = vi.fn(), close = vi.fn()
    mocks.openTestCheckout.mockReturnValue(close)
    const view = render(<TestPaymentPanel order={order} onConfirmed={confirmed} />)
    const events = await launch()
    view.unmount()
    events.result(callback)
    expect(close).toHaveBeenCalledOnce()
    expect(mocks.verifyTestPayment).not.toHaveBeenCalled()
    expect(confirmed).not.toHaveBeenCalled()
  })
  it('labels a stored paid test order as sandbox and never offers another payment', () => {
    render(<TestPaymentPanel order={{ ...order, paymentMode: 'TEST', paymentState: 'PAID', status: 'PAID' }} onConfirmed={vi.fn()} />)
    expect(screen.getByText(/no real money or fulfillment/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
