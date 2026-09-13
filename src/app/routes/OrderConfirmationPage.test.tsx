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
  it('never shows the success state for an order whose payment has not actually succeeded', () => {
    useOrder.mockReturnValue({ status: 'loaded', order: buildOrder({ paymentState: 'PENDING' }) })
    renderPage()

    expect(screen.queryByText('Order confirmed')).not.toBeInTheDocument()
    expect(screen.getByText("This order hasn't been confirmed yet")).toBeInTheDocument()
  })

  it('shows the real success state once paymentState is genuinely PAID', () => {
    useOrder.mockReturnValue({ status: 'loaded', order: buildOrder({ paymentState: 'PAID', total: 500000 }) })
    renderPage()

    expect(screen.getByText('Order confirmed')).toBeInTheDocument()
    expect(screen.getByText('₹5000')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View Order' })).toHaveAttribute('href', '/orders/order123456')
    expect(screen.getByRole('link', { name: 'Continue Shopping' })).toHaveAttribute('href', '/explore')
  })

  it('shows an error state on failure', () => {
    useOrder.mockReturnValue({ status: 'error', error: { code: 'unknown', message: 'boom' } })
    renderPage()
    expect(screen.getByText("Couldn't load this order")).toBeInTheDocument()
  })
})
