import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Timestamp } from 'firebase/firestore'
import { describe, expect, it, vi } from 'vitest'
import type { Order } from '@/features/orders'

const useOrders = vi.fn()
vi.mock('@/features/orders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/orders')>()
  return { ...actual, useOrders: () => useOrders() }
})

const { OrdersPage } = await import('./OrdersPage')

const now = Timestamp.now()

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order123456',
    buyerId: 'alice',
    status: 'PROCESSING',
    paymentState: 'PAID',
    subtotal: 500000,
    shippingCost: null,
    total: 500000,
    shippingAddress: null,
    trackingState: null,
    statusHistory: [],
    itemsPreview: [{ title: 'Sunset Over the Bay', imageUrl: null, quantity: 1 }],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OrdersPage />
    </MemoryRouter>,
  )
}

describe('OrdersPage', () => {
  it('shows a loading state', () => {
    useOrders.mockReturnValue({ status: 'loading' })
    renderPage()
    expect(screen.getByLabelText('Loading orders')).toBeInTheDocument()
  })

  it('shows an honest "No orders yet" empty state — never a fabricated order', () => {
    useOrders.mockReturnValue({ status: 'loaded', orders: [] })
    renderPage()
    expect(screen.getByText('No orders yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explore Artworks' })).toHaveAttribute('href', '/explore')
  })

  it('renders real orders, newest first as already returned by the query, with a View Details link per order', () => {
    useOrders.mockReturnValue({ status: 'loaded', orders: [buildOrder()] })
    renderPage()

    expect(screen.getByText('Sunset Over the Bay')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View Details' })).toHaveAttribute('href', '/orders/order123456')
  })

  it('shows the real order count in the page description', () => {
    useOrders.mockReturnValue({ status: 'loaded', orders: [buildOrder(), buildOrder({ id: 'o2' })] })
    renderPage()
    expect(screen.getByText('2 orders')).toBeInTheDocument()
  })

  it('filtering by a status group shows only matching orders', () => {
    useOrders.mockReturnValue({
      status: 'loaded',
      orders: [buildOrder({ id: 'o1', status: 'DELIVERED', itemsPreview: [{ title: 'Delivered piece', imageUrl: null, quantity: 1 }] }), buildOrder({ id: 'o2', status: 'PROCESSING', itemsPreview: [{ title: 'Processing piece', imageUrl: null, quantity: 1 }] })],
    })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Delivered' }))

    expect(screen.getByText('Delivered piece')).toBeInTheDocument()
    expect(screen.queryByText('Processing piece')).not.toBeInTheDocument()
  })

  it('shows an error state on failure, distinct from the empty state', () => {
    useOrders.mockReturnValue({ status: 'error', error: { code: 'unknown', message: 'boom' } })
    renderPage()
    expect(screen.getByText("Couldn't load your orders")).toBeInTheDocument()
    expect(screen.queryByText('No orders yet')).not.toBeInTheDocument()
  })
})
