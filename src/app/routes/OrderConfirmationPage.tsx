import { CheckCircle2, Clock, RotateCcw, XCircle } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link, useParams } from 'react-router'
import { useOrder } from '@/features/orders'
import type { Order } from '@/features/orders/types'
import { Button, Card, Container, EmptyState, ErrorState, PageHeader, Skeleton } from '@/shared/ui'

const PAYMENT_STATE_PRESENTATION: Record<
  Order['paymentState'],
  {
    icon: ComponentType<{ className?: string }>
    iconWrapClassName: string
    title: string
    description: string
    nextStep?: string
  }
> = {
  PENDING: {
    icon: Clock,
    iconWrapClassName: 'bg-accent-gold/15 text-accent-gold',
    title: 'Awaiting payment confirmation',
    description: "Payment for this order hasn't completed yet. This page will reflect it once it does.",
  },
  PAID: {
    icon: CheckCircle2,
    iconWrapClassName: 'bg-success/15 text-success',
    title: 'Order confirmed',
    description: 'has been placed successfully.',
    nextStep: 'Next: the seller confirms your order.',
  },
  FAILED: {
    icon: XCircle,
    iconWrapClassName: 'bg-danger/15 text-danger',
    title: 'Payment failed',
    description: "Payment for this order didn't go through. No charge was made.",
  },
  REFUNDED: {
    icon: RotateCcw,
    iconWrapClassName: 'bg-text-muted/15 text-text-secondary',
    title: 'Payment refunded',
    description: "This order's payment has been refunded.",
  },
}

/**
 * Presents all four real `Order.paymentState` values (PENDING / PAID /
 * FAILED / REFUNDED) — driven exclusively by that real field, never by
 * anything this page itself decides. PAID keeps its original "order
 * confirmed" success framing exactly; PENDING/FAILED/REFUNDED each get
 * their own honest explanation (UI-06 owner rule: never invent retry
 * behavior for FAILED, never imply a next step that isn't real). Reachable
 * only via a real order id — no order-creation path exists in this
 * codebase yet (see firestore.rules), so this page has no way to be
 * reached through a real flow today; it exists, real and correctly wired,
 * for the moment a future trusted checkout starts creating orders and
 * navigating here with a real id.
 */
export function OrderConfirmationPage() {
  const { orderId } = useParams()
  const state = useOrder(orderId)

  return (
    <Container>
      <section className="flex flex-col gap-6">
        <PageHeader title="Order Confirmation" />

        {state.status === 'loading' && (
          <div aria-busy="true" aria-label="Loading order" className="flex flex-col gap-3">
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {state.status === 'error' && <ErrorState title="Couldn't load this order" description={state.error.message} />}

        {state.status === 'missing' && (
          <EmptyState
            title="Order not found"
            description="This order doesn't exist, or isn't available to you."
            action={
              <Link to="/explore" className="inline-flex">
                <Button type="button">Explore Artworks</Button>
              </Link>
            }
          />
        )}

        {state.status === 'loaded' &&
          (() => {
            const { order } = state
            const presentation = PAYMENT_STATE_PRESENTATION[order.paymentState]
            const Icon = presentation.icon

            return (
              <Card className="flex flex-col items-center gap-4 p-8 text-center">
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-full ${presentation.iconWrapClassName}`}
                >
                  <Icon aria-hidden="true" className="h-8 w-8" />
                </span>
                <div>
                  <h2 className="font-display text-xl font-medium text-text-primary">{presentation.title}</h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {order.paymentState === 'PAID'
                      ? `Order #${order.id.slice(0, 8).toUpperCase()} ${presentation.description}`
                      : presentation.description}
                  </p>
                </div>

                <p className="font-display text-2xl font-medium text-accent-gold">₹{(order.total / 100).toFixed(0)}</p>

                {order.shippingAddress && (
                  <div className="text-sm text-text-secondary">
                    <p className="font-medium text-text-primary">Shipping to</p>
                    <p>{order.shippingAddress.fullName}</p>
                    <p>
                      {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}
                    </p>
                  </div>
                )}

                {presentation.nextStep && <p className="text-sm text-text-muted">{presentation.nextStep}</p>}

                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  <Link to={`/orders/${order.id}`} className="inline-flex">
                    <Button type="button" variant="gold">
                      View Order
                    </Button>
                  </Link>
                  <Link to="/explore" className="inline-flex">
                    <Button type="button" variant="secondary">
                      Continue Shopping
                    </Button>
                  </Link>
                </div>
              </Card>
            )
          })()}
      </section>
    </Container>
  )
}
