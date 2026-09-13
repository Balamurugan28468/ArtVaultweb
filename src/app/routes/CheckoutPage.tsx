import { ImageOff } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
import { useUserProfile } from '@/features/account'
import { CartSummary, useCartLines } from '@/features/cart'
import { DeliverySection, PaymentSection, ShippingAddressForm, type ShippingAddressFormValues } from '@/features/checkout'
import { useArtistDisplayNames } from '@/features/marketplace'
import { Button, Card, Container, EmptyState, PageHeader, Skeleton } from '@/shared/ui'

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
  const { lines, subtotal, isLoading } = useCartLines()
  const artistNames = useArtistDisplayNames(lines.map((line) => line.artwork.sellerId))

  const profile = profileState.status === 'loaded' ? profileState.profile : null
  const [shippingAddress, setShippingAddress] = useState<ShippingAddressFormValues | null>(null)
  const [addressComplete, setAddressComplete] = useState(false)

  if (!isLoading && lines.length === 0) {
    return (
      <Container>
        <section className="flex flex-col gap-6">
          <PageHeader title="Checkout" />
          <EmptyState
            title="Your cart is empty"
            description="Add something to your cart before checking out."
            action={
              <Link to="/explore" className="inline-flex">
                <Button type="button">Explore Artworks</Button>
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
        <PageHeader title="Checkout" description="Review your order before placing it." />

        {isLoading ? (
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
                    <dd className="text-text-primary">{user?.email ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">Phone</dt>
                    <dd className="text-text-primary">{profile?.phoneNumber ?? 'Not provided'}</dd>
                  </div>
                </dl>
              </Card>

              {/* B. Shipping Address */}
              <ShippingAddressForm
                defaultFullName={profile?.displayName ?? ''}
                defaultPhone={profile?.phoneNumber ?? ''}
                onChange={(values, isComplete) => {
                  setShippingAddress(values)
                  setAddressComplete(isComplete)
                }}
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
                      title="Payment integration is not connected yet."
                    >
                      Place Order
                    </Button>
                    <p className="text-center text-xs text-text-muted">
                      Payment integration is not connected yet — orders can't be placed until it is.
                      {!addressComplete && ' Finish your shipping address above first.'}
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
