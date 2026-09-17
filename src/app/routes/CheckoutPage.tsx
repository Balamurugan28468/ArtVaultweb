import { ImageOff } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
import { useUserProfile } from '@/features/account'
import { CartSummary, useCart, useCartLines } from '@/features/cart'
import { AddressPicker, DeliverySection, PaymentSection, type ShippingAddressFormValues } from '@/features/checkout'
import { useArtistDisplayNames } from '@/features/marketplace'
import { Button, Card, Container, EmptyState, PageHeader, Skeleton, buttonClassName } from '@/shared/ui'

/**
 * Protected by RequireAuth (see router.tsx) — a real shipping address and
 * order review are personal data, unlike the Cart page itself (which works
 * for guests too, same as Wishlist). Genuinely real up through Review;
 * Delivery and Payment are honestly non-functional placeholders (UI-02's
 * "No fake functionality" rule) — no shipping-rate or payment integration
 * exists anywhere in this codebase yet, so "Place order" stays disabled
 * rather than simulating a successful checkout. Nothing here ever writes
 * to an `orders` collection — see firestore.rules' own comment on why that
 * write path doesn't exist yet.
 */
export function CheckoutPage() {
  const { user } = useAuth()
  const profileState = useUserProfile()
  const { status: cartStatus } = useCart()
  const { lines, subtotal, isLoading, unavailableCount } = useCartLines()
  const artistNames = useArtistDisplayNames(lines.map((line) => line.artwork.sellerId))

  const profile = profileState.status === 'loaded' ? profileState.profile : null
  const [shippingAddress, setShippingAddress] = useState<ShippingAddressFormValues | null>(null)
  const [addressComplete, setAddressComplete] = useState(false)

  const handleAddress = useCallback((values: ShippingAddressFormValues, complete: boolean) => {
    setShippingAddress(values)
    setAddressComplete(complete)
  }, [])

  if (cartStatus === 'error') return <Container><PageHeader title="Checkout" /><p role="alert">Couldn't load your cart. Return to <Link to="/cart" className="underline">Cart</Link> to review it.</p></Container>

  if (!isLoading && cartStatus !== 'loading' && lines.length === 0) {
    return (
      <Container>
        <section className="flex flex-col gap-6">
          <PageHeader title="Checkout" />
          <EmptyState
            title={unavailableCount > 0 ? 'No available cart items' : 'Your cart is empty'}
            description={unavailableCount > 0 ? 'Your cart items could not be loaded or are unavailable. Review your cart before continuing.' : 'Add something to your cart before checking out.'}
            action={
              <Link to="/explore" className={buttonClassName('primary', 'md')}>
                Explore Artworks
              </Link>
            }
          />
        </section>
      </Container>
    )
  }

  return (
    <Container>
      <section className="flex flex-col gap-6">
        <PageHeader title="Checkout" description="Review your cart and shipping address. Order placement and payment processing are unavailable." />

        {unavailableCount > 0 && <p role="status" className="text-sm text-text-secondary">Some cart items could not be loaded or are unavailable and are excluded from this review. <Link to="/cart" className="underline">Review Cart</Link></p>}

        {isLoading || cartStatus === 'loading' ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Skeleton className="h-96 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <div className="flex flex-col gap-4">
              {/* A. Contact */}
              <Card className="flex flex-col gap-2 p-4 sm:p-5">
                <h2 className="font-display text-lg font-medium text-text-primary">Contact</h2>
                <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-text-muted">Email</dt>
                    <dd className="break-all text-text-primary">{user?.email ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">Phone</dt>
                    <dd className="text-text-primary">{profile?.phoneNumber ?? 'Not provided'}</dd>
                  </div>
                </dl>
              </Card>

              {/* B. Shipping Address */}
              <AddressPicker
                defaultFullName={profile?.displayName ?? ''}
                defaultPhone={profile?.phoneNumber ?? ''}
                onChange={handleAddress}
              />

              {/* C. Delivery */}
              <DeliverySection />

              {/* D. Payment */}
              <PaymentSection />

              {/* E. Review Order */}
              <Card className="flex flex-col gap-3 p-4 sm:p-5">
                <h2 className="font-display text-lg font-medium text-text-primary">Review Order</h2>
                <ul className="flex flex-col gap-3">
                  {lines.map((line) => (
                    <li key={line.artwork.id} className="flex items-center gap-3">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-elevated">
                        {line.artwork.images[0] ? (
                          <img src={line.artwork.images[0].url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageOff aria-hidden="true" className="h-5 w-5 text-text-muted" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-primary">{line.artwork.title}</p>
                        <p className="truncate text-xs text-text-muted">
                          {artistNames[line.artwork.sellerId] ?? 'ArtVault seller'} · Qty {line.quantity}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-medium text-text-primary">₹{(line.lineTotal / 100).toFixed(0)}</p>
                    </li>
                  ))}
                </ul>

                {addressComplete && shippingAddress && (
                  <div className="border-t border-border pt-3 text-sm text-text-secondary">
                    <p className="font-medium text-text-primary">Ship to</p>
                    <p>{shippingAddress.fullName}</p>
                    <p>
                      {shippingAddress.addressLine1}
                      {shippingAddress.addressLine2 ? `, ${shippingAddress.addressLine2}` : ''}
                    </p>
                    <p>
                      {shippingAddress.city}, {shippingAddress.state} {shippingAddress.postalCode}
                    </p>
                    <p>{shippingAddress.country}</p>
                  </div>
                )}
              </Card>
            </div>

            <div className="lg:sticky lg:top-20">
              <CartSummary
                subtotal={subtotal}
                itemCount={lines.reduce((sum, line) => sum + line.quantity, 0)}
                action={
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="gold"
                      size="lg"
                      className="w-full"
                      disabled
                      aria-disabled="true"
                      title="Order placement and payment processing are unavailable."
                    >
                      Place Order
                    </Button>
                    <p className="text-center text-xs text-text-muted">
                      Order placement and payment processing are unavailable. Completing an address does not place an order.
                      {!addressComplete && ' Your shipping address is incomplete.'}
                    </p>
                  </div>
                }
              />
            </div>
          </div>
        )}
      </section>
    </Container>
  )
}
