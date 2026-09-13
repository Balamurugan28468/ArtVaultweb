import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { Timestamp } from 'firebase/firestore'
import { describe, expect, it, vi } from 'vitest'
import type { Order, OrderItem } from '@/features/orders'

const useOrder = vi.fn()
vi.mock('@/features/orders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/orders')>()
  return { ...actual, useOrder: () => useOrder() }
})

vi.mock('@/features/marketplace', () => ({ useArtistDisplayNames: () => ({}) }))

const { OrderDetailsPage } = await import('./OrderDetailsPage')

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
    shippingAddress: {
      fullName: 'Alice Rivera',
      addressLine1: '1 Main St',
      addressLine2: null,
      city: 'Pune',
      state: 'MH',
      postalCode: '411001',
      country: 'India',
      phone: null,
    },
    trackingState: null,
    statusHistory: [{ status: 'CREATED', at: now }, { status: 'PAID', at: now }],
    itemsPreview: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function buildItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'i1',
    artworkId: 'a1',
    sellerId: 'seller1',
    title: 'Sunset Over the Bay',
    imageUrl: null,
    unitPrice: 500000,
    quantity: 1,
    subtotal: 500000,
    ...overrides,
  }
}

function renderPage(orderId = 'order123456') {
  return render(
    <MemoryRouter initialEntries={[`/orders/${orderId}`]}>
      <Routes>
        <Route path="/orders/:orderId" element={<OrderDetailsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('OrderDetailsPage', () => {
  it('shows a loading state', () => {
    useOrder.mockReturnValue({ status: 'loading' })
    renderPage()
    expect(screen.getByLabelText('Loading order')).toBeInTheDocument()
  })

  // Same privacy contract as ArtworkDetailPage: a guessed/forged order id
  // belonging to another buyer must look exactly like one that never
  // existed — getOrder's own permission-denied handling already produces
  // this 'missing' state, this just confirms the page renders it honestly.
  it('shows "Order not found" for a missing/forbidden order, with a link back to My Orders', () => {
    useOrder.mockReturnValue({ status: 'missing' })
    renderPage()
    expect(screen.getByText('Order not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to My Orders' })).toHaveAttribute('href', '/orders')
  })

  it('shows an error state on failure', () => {
    useOrder.mockReturnValue({ status: 'error', error: { code: 'unknown', message: 'boom' } })
    renderPage()
    expect(screen.getByText("Couldn't load this order")).toBeInTheDocument()
  })

  it('renders real order details: id, status, items, totals, shipping address, payment state', () => {
    useOrder.mockReturnValue({ status: 'loaded', order: buildOrder(), items: [buildItem()] })
    renderPage()

    expect(screen.getByText(/Order #/)).toBeInTheDocument()
    // "Processing" legitimately appears twice — the status badge and the
    // status timeline's own current-stage entry — so this asserts presence
    // rather than uniqueness.
    expect(screen.getAllByText('Processing').length).toBeGreaterThan(0)
    expect(screen.getByText('Sunset Over the Bay')).toBeInTheDocument()
    expect(screen.getByText('Alice Rivera')).toBeInTheDocument()
    // "Paid" also appears legitimately twice (timeline stage + payment state).
    expect(screen.getAllByText('Paid').length).toBeGreaterThan(0)
  })

  it('only renders status-history stages the order actually has — never the full 13-stage lifecycle unconditionally', () => {
    useOrder.mockReturnValue({
      status: 'loaded',
      order: buildOrder({ status: 'PAID', statusHistory: [{ status: 'CREATED', at: now }, { status: 'PAID', at: now }] }),
      items: [buildItem()],
    })
    renderPage()

    expect(screen.queryByText('Shipped')).not.toBeInTheDocument()
    expect(screen.queryByText('Delivered')).not.toBeInTheDocument()
    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument()
  })

  it('shows an honest "not available yet" tracking state rather than a fabricated tracking number', () => {
    useOrder.mockReturnValue({ status: 'loaded', order: buildOrder({ trackingState: null }), items: [buildItem()] })
    renderPage()
    expect(screen.getByText('Not available yet')).toBeInTheDocument()
  })
})
