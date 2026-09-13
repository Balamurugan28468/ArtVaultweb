import { ImageOff } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { OrderStatusBadge, OrderStatusTimeline, useOrder } from '@/features/orders'
import { useArtistDisplayNames } from '@/features/marketplace'
import { Button, Card, Container, EmptyState, ErrorState, PageHeader, Skeleton } from '@/shared/ui'

const PAYMENT_STATE_LABEL: Record<string, string> = {
  PENDING: 'Payment pending',
  PAID: 'Paid',
  FAILED: 'Payment failed',
  REFUNDED: 'Refunded',
}

function formatDate(value: { toDate?: () => Date } | undefined): string {
  const date = value?.toDate?.()
  if (!date) return '—'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

/**
 * Same "permission-denied collapses into missing" privacy contract as
 * ArtworkDetailPage/usePublicArtwork (see useOrder's own comment) — a
 * guessed or forged order id belonging to another buyer never reveals
 * whether *something* is there, it just looks exactly like an order that
 * never existed.
 */
export function OrderDetailsPage() {
  const { orderId } = useParams()
  const state = useOrder(orderId)
  const items = state.status === 'loaded' ? state.items : []
  const artistNames = useArtistDisplayNames(items.map((item) => item.sellerId).filter(Boolean))

  return (
    <Container>
      <section className="flex flex-col gap-6">
        <PageHeader title="Order Details" />

        {state.status === 'loading' && (
          <div aria-busy="true" aria-label="Loading order" className="flex flex-col gap-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {state.status === 'error' && (
          <ErrorState title="Couldn't load this order" description={state.error.message} />
        )}

        {state.status === 'missing' && (
          <EmptyState
            title="Order not found"
            description="This order doesn't exist, or isn't available to you."
            action={
              <Link to="/orders" className="inline-flex">
                <Button type="button">Back to My Orders</Button>
              </Link>
            }
          />
        )}

        {state.status === 'loaded' && (
          <>
            <Card className="flex flex-col gap-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-text-muted">Order #{state.order.id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-sm text-text-secondary">Placed {formatDate(state.order.createdAt)}</p>
                </div>
                <OrderStatusBadge status={state.order.status} />
              </div>
            </Card>

            <Card className="flex flex-col gap-4 p-4 sm:p-5">
              <h2 className="font-display text-lg font-medium text-text-primary">Status</h2>
              <OrderStatusTimeline order={state.order} />
            </Card>

            <Card className="flex flex-col gap-3 p-4 sm:p-5">
              <h2 className="font-display text-lg font-medium text-text-primary">Items</h2>
              <ul className="flex flex-col gap-3">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-elevated">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageOff aria-hidden="true" className="h-5 w-5 text-text-muted" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link to={`/artworks/${item.artworkId}`} className="truncate text-sm font-medium text-text-primary hover:underline">
                        {item.title}
                      </Link>
                      <p className="truncate text-xs text-text-muted">
                        {artistNames[item.sellerId] ?? 'ArtVault seller'} · Qty {item.quantity} · ₹{(item.unitPrice / 100).toFixed(0)} each
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-medium text-text-primary">₹{(item.subtotal / 100).toFixed(0)}</p>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
                <div className="flex justify-between text-text-secondary">
                  <span>Subtotal</span>
                  <span>₹{(state.order.subtotal / 100).toFixed(0)}</span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>Shipping</span>
                  <span>{state.order.shippingCost === null ? 'Calculated at checkout' : `₹${(state.order.shippingCost / 100).toFixed(0)}`}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-base font-medium text-text-primary">
                  <span>Total</span>
                  <span className="text-accent-gold">₹{(state.order.total / 100).toFixed(0)}</span>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card className="flex flex-col gap-2 p-4 sm:p-5">
                <h2 className="font-display text-base font-medium text-text-primary">Shipping Address</h2>
                {state.order.shippingAddress ? (
                  <div className="text-sm text-text-secondary">
                    <p className="text-text-primary">{state.order.shippingAddress.fullName}</p>
                    <p>
                      {state.order.shippingAddress.addressLine1}
                      {state.order.shippingAddress.addressLine2 ? `, ${state.order.shippingAddress.addressLine2}` : ''}
                    </p>
                    <p>
                      {state.order.shippingAddress.city}, {state.order.shippingAddress.state}{' '}
                      {state.order.shippingAddress.postalCode}
                    </p>
                    <p>{state.order.shippingAddress.country}</p>
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">No shipping address on file for this order.</p>
                )}
              </Card>

              <Card className="flex flex-col gap-2 p-4 sm:p-5">
                <h2 className="font-display text-base font-medium text-text-primary">Payment &amp; Shipment</h2>
                <p className="text-sm text-text-secondary">
                  Payment: <span className="text-text-primary">{PAYMENT_STATE_LABEL[state.order.paymentState] ?? state.order.paymentState}</span>
                </p>
                <p className="text-sm text-text-secondary">
                  Tracking:{' '}
                  <span className="text-text-primary">{state.order.trackingState ?? 'Not available yet'}</span>
                </p>
              </Card>
            </div>
          </>
        )}
      </section>
    </Container>
  )
}
