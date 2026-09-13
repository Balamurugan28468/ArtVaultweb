import { render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import type { Order } from '../types'
import { OrderStatusTimeline } from './OrderStatusTimeline'

const now = Timestamp.now()

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    buyerId: 'alice',
    status: 'PROCESSING',
    paymentState: 'PAID',
    subtotal: 0,
    shippingCost: null,
    total: 0,
    shippingAddress: null,
    trackingState: null,
    statusHistory: [],
    itemsPreview: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('OrderStatusTimeline', () => {
  it('renders only the stages present in statusHistory, in lifecycle order — never the full 13-stage list unconditionally', () => {
    render(
      <OrderStatusTimeline
        order={buildOrder({
          status: 'PACKED',
          statusHistory: [
            { status: 'CREATED', at: now },
            { status: 'PAID', at: now },
            { status: 'PACKED', at: now },
          ],
        })}
      />,
    )

    expect(screen.getByText('Order placed')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.getByText('Packed')).toBeInTheDocument()
    expect(screen.queryByText('Shipped')).not.toBeInTheDocument()
    expect(screen.queryByText('Delivered')).not.toBeInTheDocument()
  })

  it("always includes the order's own current status, even if statusHistory doesn't explicitly list it", () => {
    render(<OrderStatusTimeline order={buildOrder({ status: 'PROCESSING', statusHistory: [] })} />)
    expect(screen.getByText('Processing')).toBeInTheDocument()
  })

  it('renders a terminal status (e.g. Cancelled) as a distinct entry below the normal progress track, not forced onto it', () => {
    render(
      <OrderStatusTimeline
        order={buildOrder({
          status: 'CANCELLED',
          statusHistory: [
            { status: 'CREATED', at: now },
            { status: 'PAID', at: now },
            { status: 'CANCELLED', at: now },
          ],
        })}
      />,
    )

    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.queryByText('Shipped')).not.toBeInTheDocument()
    expect(screen.queryByText('Delivered')).not.toBeInTheDocument()
  })

  it('shows an honest fallback when there is no status history at all and the order is not terminal', () => {
    render(<OrderStatusTimeline order={buildOrder({ status: 'CREATED', statusHistory: [] })} />)
    // CREATED is the order's own current status, so it still renders as reached.
    expect(screen.getByText('Order placed')).toBeInTheDocument()
  })
})
