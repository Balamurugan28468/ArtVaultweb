import { ImageOff } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
import { useUserProfile } from '@/features/account'
import { CartSummary, useCart, useCartLines } from '@/features/cart'
import { AddressPicker, DeliverySection, PaymentSection, type ShippingAddressFormValues } from '@/features/checkout'
import { useArtistDisplayNames } from '@/features/marketplace'
import { availableInventory } from '@/features/inventory/stock'
import { useCheckoutOrder } from '@/features/checkout/hooks/useCheckoutOrder'
import { Button, Card, Container, EmptyState, PageHeader, Skeleton, buttonClassName } from '@/shared/ui'

/**
 * Protected by RequireAuth (see router.tsx) — a real shipping address and
 * order review are personal data, unlike the Cart page itself (which works
 * for guests too, same as Wishlist). Genuinely real up through Review;
 * The callable creates an unpaid reservation using saved IDs only. Payment,
 * shipping rates and taxes remain unavailable; no client writes orders or stock.
 */
export function CheckoutPage() {
  const { user } = useAuth()
  const profileState = useUserProfile()
  const { status: cartStatus, mode, isPending } = useCart()
  const checkout = useCheckoutOrder(user?.uid)
  const { lines, subtotal, isLoading, unavailableCount } = useCartLines()
  const artistNames = useArtistDisplayNames(lines.map((line) => line.artwork.sellerId))

  const profile = profileState.status === 'loaded' ? profileState.profile : null
  const [shippingAddress, setShippingAddress] = useState<ShippingAddressFormValues | null>(null)
  const [addressComplete, setAddressComplete] = useState(false)
  const [addressId, setAddressId] = useState<string | null>(null)

  const handleAddress = useCallback((values: ShippingAddressFormValues, complete: boolean) => {
    setShippingAddress(values)
    setAddressComplete(complete)
  }, [])

  if (checkout.unresolved) return <Container><PageHeader title="Recover checkout" description="A previous checkout request has not been confirmed. Recover the same request before creating another order." />
    {checkout.error && <p role="alert">{checkout.error}</p>}
    <Button disabled={checkout.pending} onClick={() => void checkout.retry()}>{checkout.pending ? 'Checking order…' : 'Retry previous checkout'}</Button>
  </Container>

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
        <PageHeader title="Checkout" description="Create a secure unpaid order with a 30-minute stock reservation. Configured Razorpay test checkout is available on the order page; no payment is taken here." />

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
                onSelectionChange={setAddressId}
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
                      <p className="shrink-0 text-sm font-medium text-text-primary">₹{line.lineTotal / 100}</p>
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
                      disabled={checkout.pending || mode !== 'account' || !addressComplete || !addressId || unavailableCount > 0 || lines.some((line) => isPending?.(line.artwork.id) || line.quantity > availableInventory(line.artwork))}
                      onClick={() => { if (addressId) void checkout.submit(lines.map((line) => line.artwork.id), addressId) }}
                    >
                      {checkout.pending ? 'Creating order…' : 'Create unpaid order'}
                    </Button>
                    <p className="text-center text-xs text-text-muted">
                      The server verifies prices and stock. Only included cart items are removed after a successful order. Payment remains unavailable.
                      {(!addressComplete || !addressId) && ' Select or save a complete shipping address first.'}
                    </p>
                    {checkout.error && <p role="alert" className="text-sm text-danger">{checkout.error}</p>}
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
