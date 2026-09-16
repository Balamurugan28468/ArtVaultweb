import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { Timestamp } from 'firebase/firestore'
import { describe, expect, it, vi } from 'vitest'
import type { Order } from '@/features/orders'

const useOrder = vi.fn()
vi.mock('@/features/orders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/orders')>()
  return { ...actual, useOrder: () => useOrder() }
})

const { OrderConfirmationPage } = await import('./OrderConfirmationPage')

const now = Timestamp.now()

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order123456',
    buyerId: 'alice',
    status: 'PAID',
    paymentState: 'PAID',
    subtotal: 500000,
    shippingCost: null,
    total: 500000,
    shippingAddress: null,
    trackingState: null,
    statusHistory: [],
    itemsPreview: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function renderPage(orderId = 'order123456') {
  return render(
    <MemoryRouter initialEntries={[`/checkout/confirmation/${orderId}`]}>
      <Routes>
        <Route path="/checkout/confirmation/:orderId" element={<OrderConfirmationPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('OrderConfirmationPage', () => {
  it('shows a loading state', () => {
    useOrder.mockReturnValue({ status: 'loading' })
    renderPage()
    expect(screen.getByLabelText('Loading order')).toBeInTheDocument()
  })

  it('shows "Order not found" rather than any success state for a missing/forbidden order', () => {
    useOrder.mockReturnValue({ status: 'missing' })
    renderPage()
    expect(screen.getByText('Order not found')).toBeInTheDocument()
    expect(screen.queryByText('Order confirmed')).not.toBeInTheDocument()
  })

  // The core rule this page exists to enforce: never render success unless
  // the backend genuinely recorded a successful payment.
  it('never shows the success state for an order whose payment is still PENDING — shows a neutral, honest explanation instead', () => {
    useOrder.mockReturnValue({ status: 'loaded', order: buildOrder({ paymentState: 'PENDING' }) })
    renderPage()

    expect(screen.queryByText('Order confirmed')).not.toBeInTheDocument()
    expect(screen.getByText('Awaiting payment confirmation')).toBeInTheDocument()
    expect(screen.getByText(/hasn't completed yet/i)).toBeInTheDocument()
  })

  it('shows an honest failure presentation for a FAILED payment — no invented retry behavior', () => {
    useOrder.mockReturnValue({ status: 'loaded', order: buildOrder({ paymentState: 'FAILED' }) })
    renderPage()

    expect(screen.queryByText('Order confirmed')).not.toBeInTheDocument()
    expect(screen.getByText('Payment failed')).toBeInTheDocument()
    expect(screen.getByText(/didn't go through. No charge was made/i)).toBeInTheDocument()
    expect(screen.queryByText(/retry/i)).not.toBeInTheDocument()
  })

  it('shows an honest refunded presentation for a REFUNDED payment', () => {
    useOrder.mockReturnValue({ status: 'loaded', order: buildOrder({ paymentState: 'REFUNDED' }) })
    renderPage()

    expect(screen.queryByText('Order confirmed')).not.toBeInTheDocument()
    expect(screen.getByText('Payment refunded')).toBeInTheDocument()
    expect(screen.getByText(/has been refunded/i)).toBeInTheDocument()
  })

  it('shows the real success state once paymentState is genuinely PAID', () => {
    useOrder.mockReturnValue({ status: 'loaded', order: buildOrder({ paymentState: 'PAID', total: 500000 }) })
    renderPage()

    expect(screen.getByText('Order confirmed')).toBeInTheDocument()
    expect(screen.getByText('₹5000')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View Order' })).toHaveAttribute('href', '/orders/order123456')
    expect(screen.getByRole('link', { name: 'Continue Shopping' })).toHaveAttribute('href', '/explore')
    expect(screen.getByText('Next: the seller confirms your order.')).toBeInTheDocument()
  })

  it('offers a real View Order link even for a FAILED payment — never a dead end', () => {
    useOrder.mockReturnValue({ status: 'loaded', order: buildOrder({ paymentState: 'FAILED' }) })
    renderPage()
    expect(screen.getByRole('link', { name: 'View Order' })).toHaveAttribute('href', '/orders/order123456')
  })

  it('shows an error state on failure', () => {
    useOrder.mockReturnValue({ status: 'error', error: { code: 'unknown', message: 'boom' } })
    renderPage()
    expect(screen.getByText("Couldn't load this order")).toBeInTheDocument()
  })
})
