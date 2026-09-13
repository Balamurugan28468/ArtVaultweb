import { CheckCircle2 } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { useOrder } from '@/features/orders'
import { Button, Card, Container, EmptyState, ErrorState, PageHeader, Skeleton } from '@/shared/ui'

/**
 * Renders the success state only for a genuinely successful order —
 * `order.paymentState === 'PAID'` (or further along: the lifecycle only
 * ever reaches SELLER_CONFIRMED/PROCESSING/etc. once payment already
 * succeeded). A real order sitting at CREATED/PAYMENT_PENDING is shown
 * honestly as not-yet-confirmed, never as a fake success screen — UI-02's
 * "Do not render success if the backend order/payment is not actually
 * successful" rule applies exactly as strictly here as it does to the
 * Checkout page's own disabled "Place order" button. Reachable only via a
 * real order id today there is no order-creation path in this codebase
 * yet (see firestore.rules), so this page has no way to be reached
 * through a real flow — it exists, real and correctly wired, for the
 * moment a future trusted checkout starts creating orders and navigating
 * here with a real id.
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

        {state.status === 'loaded' && state.order.paymentState !== 'PAID' && (
          <EmptyState
            title="This order hasn't been confirmed yet"
            description="Payment for this order hasn't completed, so there's nothing to confirm yet. Check My Orders for its current status."
            action={
              <Link to={`/orders/${state.order.id}`} className="inline-flex">
                <Button type="button">View Order</Button>
              </Link>
            }
          />
        )}

        {state.status === 'loaded' && state.order.paymentState === 'PAID' && (
          <Card className="flex flex-col items-center gap-4 p-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
              <CheckCircle2 aria-hidden="true" className="h-8 w-8" />
            </span>
            <div>
              <h2 className="font-display text-xl font-medium text-text-primary">Order confirmed</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Order #{state.order.id.slice(0, 8).toUpperCase()} has been placed successfully.
              </p>
            </div>

            <p className="font-display text-2xl font-medium text-accent-gold">₹{(state.order.total / 100).toFixed(0)}</p>

            {state.order.shippingAddress && (
              <div className="text-sm text-text-secondary">
                <p className="font-medium text-text-primary">Shipping to</p>
                <p>{state.order.shippingAddress.fullName}</p>
                <p>
                  {state.order.shippingAddress.city}, {state.order.shippingAddress.state}{' '}
                  {state.order.shippingAddress.postalCode}
                </p>
              </div>
            )}

            <p className="text-sm text-text-muted">Next: the seller confirms your order.</p>

            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <Link to={`/orders/${state.order.id}`} className="inline-flex">
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
        )}
      </section>
    </Container>
  )
}
