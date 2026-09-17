import { ShoppingCart } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { CartItemRow, CartSummary, useCart, useCartLines } from '@/features/cart'
import { useArtistDisplayNames } from '@/features/marketplace'
import { Button, Container, EmptyState, PageHeader, Skeleton, buttonClassName } from '@/shared/ui'

/**
 * Genuinely public, like /wishlist (Module 09) — a guest can build a cart
 * before creating an account (see CartProvider's guest/account dual mode).
 * Checkout itself is the protected step (see router.tsx's RequireAuth
 * wrapping /checkout), not the cart.
 */
export function CartPage() {
  const { mode, status, setQuantity, removeItem } = useCart()
  const { lines, unavailableCount, subtotal, isLoading } = useCartLines()
  const artistNames = useArtistDisplayNames(lines.map((line) => line.artwork.sellerId))
  const navigate = useNavigate()

  return (
    <Container size="wide">
      <section className="flex flex-col gap-6">
        <PageHeader
          title="Cart"
          description={
            isLoading ? 'Loading your cart…' : `${lines.length} artwork${lines.length === 1 ? '' : 's'} in your cart`
          }
        />

        {mode === 'guest' && lines.length > 0 && (
          <p className="rounded-lg border border-border-strong bg-surface-elevated px-4 py-3 text-sm text-text-secondary">
            Saved on this device only.{' '}
            <Link to="/sign-in" state={{ from: "/cart" }} className="font-medium text-brand-primary-on-dark hover:underline">
              Sign in
            </Link>{' '}
            to keep your cart across devices and check out.
          </p>
        )}

        {status === 'error' && (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            Couldn't load your cart. Please try again.
          </p>
        )}

        {status !== 'error' && isLoading && (
          <div aria-busy="true" aria-label="Loading cart" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
            <Skeleton className="h-56 w-full" />
          </div>
        )}

              {status !== 'error' && !isLoading && unavailableCount > 0 && (
                <p className="text-center text-sm text-text-muted">
                  {unavailableCount} cart item{unavailableCount === 1 ? ' is' : 's are'} unavailable or could not be loaded and{' '}
                  {unavailableCount === 1 ? 'has' : 'have'} been excluded from your total.
                </p>
              )}

        {status !== 'error' && !isLoading && lines.length === 0 && (
          <EmptyState
            title={unavailableCount > 0 ? 'No available cart items' : 'Your cart is empty'}
            description="Browse ArtVault's catalog and add something you love — it'll show up here."
            action={
              <Link to="/explore" className={buttonClassName('primary', 'md')}>
                Explore Artworks
              </Link>
            }
          />
        )}

        {status !== 'error' && !isLoading && lines.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <div className="flex flex-col gap-3">
              {lines.map((line) => (
                <CartItemRow
                  key={line.artwork.id}
                  line={line}
                  artistDisplayName={artistNames[line.artwork.sellerId]}
                  onQuantityChange={(quantity) => setQuantity(line.artwork.id, quantity)}
                  onRemove={() => removeItem(line.artwork.id)}
                />
              ))}

            </div>

            <div className="lg:sticky lg:top-20">
              <CartSummary
                subtotal={subtotal}
                itemCount={lines.reduce((sum, line) => sum + line.quantity, 0)}
                action={
                  <Button type="button" variant="gold" size="lg" className="w-full" onClick={() => navigate('/checkout')}>
                    <ShoppingCart aria-hidden="true" className="h-4 w-4" />
                    Proceed to Checkout
                  </Button>
                }
              />
            </div>
          </div>
        )}
      </section>
    </Container>
  )
}
