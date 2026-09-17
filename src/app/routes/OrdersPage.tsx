import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { OrderCard, useOrders, type OrderStatus } from '@/features/orders'
import { Button, Chip, Container, EmptyState, ErrorState, PageHeader, Skeleton } from '@/shared/ui'

// A practical subset of the full 13-state lifecycle for filtering — the
// owner-specified lifecycle distinguishes stages (PACKED vs. SHIPPED vs.
// OUT_FOR_DELIVERY) that are more useful for a single order's own timeline
// than as a top-level filter a buyer would want to click through; grouping
// them under one "Shipped" filter chip stays honest (every order literally
// with one of those three statuses matches it) while keeping the filter
// row usable rather than 13 chips wide.
const FILTERS: { id: 'ALL' | OrderStatus[]; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: ['CREATED', 'PAYMENT_PENDING', 'PAID', 'SELLER_CONFIRMED', 'PROCESSING'], label: 'Processing' },
  { id: ['PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY'], label: 'Shipped' },
  { id: ['DELIVERED'], label: 'Delivered' },
  { id: ['CANCELLED', 'REFUND_REQUESTED', 'REFUNDED', 'DELIVERY_FAILED'], label: 'Cancelled / Refunded' },
]

// Stable reference for the "not loaded yet" case — a fresh `[]` literal
// inline below would give useMemo a "changed" dependency on every render
// even while genuinely empty, defeating the memoization entirely.
const NO_ORDERS: never[] = []

export function OrdersPage() {
  const state = useOrders()
  const [activeFilter, setActiveFilter] = useState<(typeof FILTERS)[number]['id']>('ALL')

  const orders = state.status === 'loaded' ? state.orders : NO_ORDERS
  const filteredOrders = useMemo(() => {
    if (activeFilter === 'ALL') return orders
    return orders.filter((order) => (activeFilter as OrderStatus[]).includes(order.status))
  }, [orders, activeFilter])

  return (
    <Container size="wide">
      <section className="flex flex-col gap-6">
        <PageHeader
          title="My Orders"
          description={state.status === 'loaded' ? `${orders.length} order${orders.length === 1 ? '' : 's'}` : undefined}
        />

        {state.status === 'loaded' && orders.length > 0 && (
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 xs:mx-0 xs:px-0 xs:pb-0 xs:flex-wrap">
            {FILTERS.map((filter) => (
              <Chip
                key={filter.label}
                label={filter.label}
                selected={activeFilter === filter.id}
                onClick={() => setActiveFilter(filter.id)}
              />
            ))}
          </div>
        )}

        {state.status === 'error' && (
          <ErrorState title="Couldn't load your orders" description={state.error.message} />
        )}

        {state.status === 'loading' && (
          <div aria-busy="true" aria-label="Loading orders" className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {state.status === 'loaded' && orders.length === 0 && (
          <EmptyState
            title="No orders yet"
            description="You have no recorded orders. Order placement is not available yet."
            action={
              <Link to="/explore" className="inline-flex">
                <Button type="button">Explore Artworks</Button>
              </Link>
            }
          />
        )}

        {state.status === 'loaded' && orders.length > 0 && filteredOrders.length === 0 && (
          <EmptyState title="No orders match this filter" description="Try a different status filter above." />
        )}

        {state.status === 'loaded' && filteredOrders.length > 0 && (
          <div className="flex flex-col gap-3">
            {filteredOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </section>
    </Container>
  )
}
