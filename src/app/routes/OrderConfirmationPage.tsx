import { CheckCircle2, Clock, RotateCcw, XCircle } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link, useParams } from 'react-router'
import { useOrder } from '@/features/orders'
import { OrderStatusBadge } from '@/features/orders/components/OrderStatusBadge'
import type { Order } from '@/features/orders/types'
import { Card, Container, EmptyState, ErrorState, PageHeader, Skeleton, buttonClassName } from '@/shared/ui'

const PAYMENT_STATE_PRESENTATION: Record<
  NonNullable<Order['paymentState']>,
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
    description: "The stored payment status is pending. This page does not update automatically.",
  },
  PAID: {
    icon: CheckCircle2,
    iconWrapClassName: 'bg-success/15 text-success',
    title: 'Payment recorded as paid',
    description: 'The stored payment status is paid. Check the order details for its current fulfillment status.',
  },
  FAILED: {
    icon: XCircle,
    iconWrapClassName: 'bg-danger/15 text-danger',
    title: 'Payment failed',
    description: "The stored payment status is failed. This status alone does not establish whether a charge occurred.",
  },
  REFUNDED: {
    icon: RotateCcw,
    iconWrapClassName: 'bg-text-muted/15 text-text-secondary',
    title: 'Payment refunded',
    description: "This order's payment has been refunded.",
  },
}

/** Read-only presentation of an existing order; never creates or confirms a payment. */
export function OrderConfirmationPage() {
  const { orderId } = useParams()
  const state = useOrder(orderId)

  return (
    <Container>
      <section className="flex flex-col gap-6">
        <PageHeader title="Order Status" />

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
              <Link to="/explore" className={buttonClassName('primary', 'md')}>
                Explore Artworks
              </Link>
            }
          />
        )}

        {state.status === 'loaded' &&
          (() => {
            const { order } = state
            const presentation = order.paymentState ? PAYMENT_STATE_PRESENTATION[order.paymentState] : {
              icon: Clock, iconWrapClassName: 'bg-surface-elevated text-text-muted', title: 'Payment status unavailable',
              description: 'No recognized payment status is recorded for this order.', nextStep: undefined,
            }
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
                    {presentation.description}
                  </p>
                </div>

                <p className="text-sm text-text-secondary">Order #{order.id.slice(0, 8).toUpperCase()}</p>
                <OrderStatusBadge status={order.status} />
                <p className="font-display text-2xl font-medium text-accent-gold">₹{(order.total / 100).toFixed(0)}</p>

                {order.shippingAddress && (
                  <div className="text-sm text-text-secondary">
                    <p className="font-medium text-text-primary">Recorded shipping address</p>
                    <p>{order.shippingAddress.fullName}</p>
                    <p>
                      {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}
                    </p>
                  </div>
                )}

                {presentation.nextStep && <p className="text-sm text-text-muted">{presentation.nextStep}</p>}

                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  <Link to={`/orders/${order.id}`} className={buttonClassName('gold', 'md')}>
                View Order
              </Link>
                  <Link to="/explore" className={buttonClassName('secondary', 'md')}>
                Continue Shopping
              </Link>
                </div>
              </Card>
            )
          })()}
      </section>
    </Container>
  )
}
