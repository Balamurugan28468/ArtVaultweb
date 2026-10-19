import { useState } from 'react'
import { Badge, Button, Card, EmptyState, ErrorState, Input, Skeleton } from '@/shared/ui'
import { RotateCw, ShieldAlert } from 'lucide-react'
import { useAdminOrders } from '../hooks/useAdminOrders'
import type { AdminOrderRecord } from '../types'

export function AdminOrdersView() {
  const { data: orders, status, error, refetch, isFetching } = useAdminOrders()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  if (status === 'pending') {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading orders">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <ErrorState
        title="Could not load orders"
        description={error?.message || 'Something went wrong while loading orders oversight.'}
        action={
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        }
      />
    )
  }

  const orderList = orders ?? []
  const filtered = orderList.filter((o: AdminOrderRecord) => {
    if (statusFilter !== 'ALL' && o.status !== statusFilter) return false
    const query = search.toLowerCase().trim()
    if (!query) return true
    return (
      o.id.toLowerCase().includes(query) ||
      (o.buyerName?.toLowerCase().includes(query) ?? false) ||
      (o.buyerEmail?.toLowerCase().includes(query) ?? false) ||
      o.status.toLowerCase().includes(query) ||
      o.paymentState.toLowerCase().includes(query)
    )
  })

  const formatPrice = (minor: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(minor / 100)
  }

  const getStatusTone = (s: string) => {
    switch (s) {
      case 'PAID':
      case 'DELIVERED':
        return 'success'
      case 'PAYMENT_PENDING':
      case 'PROCESSING':
      case 'SHIPPED':
        return 'gold'
      case 'CANCELLED':
        return 'danger'
      default:
        return 'neutral'
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Read-Only Safeguard Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-muted/60 p-4">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" />
        <div className="text-xs text-text-secondary">
          <span className="font-semibold text-text-primary">Read-Only Order Oversight: </span>
          Payment settlement, inventory consumption, and order progression remain strictly server-authoritative.
          Browser admin tools cannot mark orders PAID, bypass Razorpay, or manipulate inventory reservations.
        </div>
      </div>

      {/* Filter and search */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {['ALL', 'PAID', 'PAYMENT_PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map(
            (tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === tab
                    ? 'bg-brand-primary text-text-primary'
                    : 'bg-surface-muted text-text-secondary hover:text-text-primary'
                }`}
              >
                {tab}
              </button>
            ),
          )}
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Search order ID, buyer, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RotateCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={search || statusFilter !== 'ALL' ? 'No matching orders' : 'No orders found'}
          description={
            search || statusFilter !== 'ALL'
              ? 'Try adjusting your search terms or filter.'
              : 'Customer orders will appear here for support inspection.'
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((order) => (
            <Card key={order.id} className="flex flex-col gap-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-text-primary">
                      #{order.id.slice(0, 8)}
                    </span>
                    <Badge tone={getStatusTone(order.status)}>{order.status}</Badge>
                    <Badge tone={order.paymentState === 'PAID' ? 'success' : 'neutral'}>
                      Payment: {order.paymentState}
                    </Badge>
                  </div>
                  <p className="text-sm text-text-secondary">
                    Buyer: {order.buyerName || 'Customer'} ({order.buyerEmail || 'No email'})
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-base font-bold text-text-primary">
                    {formatPrice(order.totalMinor)}
                  </div>
                  <div className="text-xs text-text-muted">
                    {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2 text-xs text-text-muted">
                <span>Placed on {new Date(order.createdAt).toLocaleString()}</span>
                <span className="font-mono text-[10px] text-text-muted">UUID: {order.id}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

