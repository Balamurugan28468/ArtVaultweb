import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import type { Order } from '../types'
import { OrderCard } from './OrderCard'

const now = Timestamp.now()

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order123456',
    buyerId: 'alice',
    status: 'DELIVERED',
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

function renderCard(order: Order) {
  return render(
    <MemoryRouter>
      <OrderCard order={order} />
    </MemoryRouter>,
  )
}

describe('OrderCard', () => {
  it('shows a shortened order id, status badge, primary item title, and real total', () => {
    renderCard(buildOrder())
    expect(screen.getByText(/Order #/)).toBeInTheDocument()
    expect(screen.getByText('Delivered')).toBeInTheDocument()
    expect(screen.getByText('Sunset Over the Bay')).toBeInTheDocument()
    expect(screen.getByText('₹5000')).toBeInTheDocument()
  })

  it('shows "+ N more" when the order has multiple items, without fabricating their titles', () => {
    renderCard(
      buildOrder({
        itemsPreview: [
          { title: 'Sunset Over the Bay', imageUrl: null, quantity: 1 },
          { title: 'Moonlit Harbor', imageUrl: null, quantity: 1 },
        ],
      }),
    )
    expect(screen.getByText(/\+ 1 more/)).toBeInTheDocument()
    expect(screen.queryByText('Moonlit Harbor')).not.toBeInTheDocument()
  })

  it('links View Details to the real order id', () => {
    renderCard(buildOrder({ id: 'abcdef1234567' }))
    expect(screen.getByRole('link', { name: 'View Details' })).toHaveAttribute('href', '/orders/abcdef1234567')
  })
})
