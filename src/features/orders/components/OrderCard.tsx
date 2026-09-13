import { ImageOff } from 'lucide-react'
import { Link } from 'react-router'
import { Button, Card } from '@/shared/ui'
import type { Order } from '../types'
import { OrderStatusBadge } from './OrderStatusBadge'

function formatDate(value: Order['createdAt']): string {
  const date = value?.toDate?.()
  if (!date) return ''
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * One order row on the My Orders page. Reads only `order.itemsPreview` — a
 * small denormalized snapshot written alongside the order itself (see
 * Order's own comment on why) — never the full `items` subcollection, so
 * rendering a list of orders is exactly one read per order, not two.
 */
export function OrderCard({ order }: { order: Order }) {
  const primary = order.itemsPreview[0]
  const extraCount = Math.max(0, order.itemsPreview.length - 1)

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-elevated">
        {primary?.imageUrl ? (
          <img src={primary.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageOff aria-hidden="true" className="h-5 w-5 text-text-muted" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-text-primary">Order #{order.id.slice(0, 8).toUpperCase()}</p>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="truncate text-sm text-text-secondary">
          {primary?.title ?? 'Order'}
          {extraCount > 0 ? ` + ${extraCount} more` : ''}
        </p>
        <p className="text-xs text-text-muted">{formatDate(order.createdAt)}</p>
      </div>

      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center sm:gap-2">
        <p className="font-display text-base font-medium text-accent-gold">₹{(order.total / 100).toFixed(0)}</p>
        <Link to={`/orders/${order.id}`}>
          <Button type="button" variant="secondary" size="sm">
            View Details
          </Button>
        </Link>
      </div>
    </Card>
  )
}
