import { Check } from 'lucide-react'
import { ORDER_PROGRESS_STATUSES } from '../types'
import type { Order, OrderStatus } from '../types'
import { ORDER_STATUS_LABEL } from './OrderStatusBadge'

/**
 * Renders only the forward-progress stages a given order's own
 * `statusHistory` actually contains, in the fixed lifecycle order (UI-02's
 * "only show stages supported by current data" + "do not simulate
 * transitions" rules) — never every one of the 13 known lifecycle states
 * unconditionally, and never a stage this order never reached. A terminal
 * exception status (CANCELLED/REFUND_REQUESTED/REFUNDED/DELIVERY_FAILED)
 * renders as its own final, clearly distinct entry below the normal track
 * rather than forcing it to fit the same straight line — cancelling from
 * PROCESSING doesn't mean the order "became" SHIPPED on the way there.
 */
export function OrderStatusTimeline({ order }: { order: Order }) {
  const reachedStatuses = new Set(order.statusHistory.map((event) => event.status))
  // The order's own current status is always considered "reached," even if
  // statusHistory is sparse/missing an entry for it — an order's own
  // status field is itself proof that stage happened.
  reachedStatuses.add(order.status)

  const progressSteps = ORDER_PROGRESS_STATUSES.filter((status) => reachedStatuses.has(status))
  const terminalEvent = order.statusHistory.find((event) =>
    event.status === order.status,
  )
  const isTerminal = (['CANCELLED', 'REFUND_REQUESTED', 'REFUNDED', 'DELIVERY_FAILED'] as OrderStatus[]).includes(
    order.status,
  )

  if (progressSteps.length === 0 && !isTerminal) {
    return <p className="text-sm text-text-muted">No status history is available for this order yet.</p>
  }

  return (
    <ol className="flex flex-col gap-3">
      {progressSteps.map((status, index) => {
        const isCurrent = status === order.status
        const event = order.statusHistory.find((e) => e.status === status)
        return (
          <li key={status} className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                isCurrent ? 'bg-accent-gold text-text-on-light' : 'bg-success/20 text-success'
              }`}
              aria-hidden="true"
            >
              <Check className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className={`text-sm font-medium ${isCurrent ? 'text-text-primary' : 'text-text-secondary'}`}>
                {ORDER_STATUS_LABEL[status]}
              </p>
              {event?.at && (
                <p className="text-xs text-text-muted">{formatTimestamp(event.at)}</p>
              )}
            </div>
            {index < progressSteps.length - 1 && <span className="sr-only"> then </span>}
          </li>
        )
      })}

      {isTerminal && (
        <li className="flex items-start gap-3 border-t border-border pt-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger/20 text-danger" aria-hidden="true">
            <Check className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-sm font-medium text-text-primary">{ORDER_STATUS_LABEL[order.status]}</p>
            {terminalEvent?.at && <p className="text-xs text-text-muted">{formatTimestamp(terminalEvent.at)}</p>}
          </div>
        </li>
      )}
    </ol>
  )
}

function formatTimestamp(value: { toDate?: () => Date } | Date): string {
  const date = value instanceof Date ? value : value.toDate?.()
  if (!date) return ''
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
