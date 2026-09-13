import { Check } from 'lucide-react'
import { Link } from 'react-router'
import { Button, buttonClassName, useToast, type ButtonSize } from '@/shared/ui'
import { useCart } from '../context/CartProvider'

/**
 * The one real "Add to Cart" control in the app (UI-02) — replaces the
 * honestly-disabled placeholder ArtworkDetailPage shipped with in UI-01
 * (see that file's own comment on why it was deferred). `inventoryCount`
 * gates it the same way a real storefront would: an artwork with none left
 * shows "Sold out" rather than a control that would add an item the seller
 * has no stock for — a client-side courtesy only, never the authority on
 * inventory (see firestore.rules' own comment on `carts/{uid}/items` for
 * why real inventory enforcement is still a future trusted-checkout
 * function's job).
 *
 * Once the artwork is already in the cart, this becomes an honest "In
 * cart" state linking straight to /cart to adjust quantity there, rather
 * than silently incrementing again on every click.
 */
export function AddToCartButton({
  artworkId,
  inventoryCount,
  size = 'md',
  className = '',
}: {
  artworkId: string
  inventoryCount: number
  size?: ButtonSize
  className?: string
}) {
  const { getQuantity, addItem } = useCart()
  const toast = useToast()
  const quantityInCart = getQuantity(artworkId)
  const soldOut = inventoryCount <= 0

  if (soldOut) {
    return (
      <Button type="button" variant="secondary" size={size} disabled aria-disabled="true" title="Sold out" className={className}>
        Sold out
      </Button>
    )
  }

  if (quantityInCart > 0) {
    return (
      <Link
        to="/cart"
        className={`${buttonClassName('secondary', size)} ${className}`}
        aria-label={`In cart: ${quantityInCart}. Go to cart`}
      >
        <Check aria-hidden="true" className="h-4 w-4" />
        In cart ({quantityInCart})
      </Link>
    )
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      className={className}
      onClick={() => {
        void addItem(artworkId, 1)
        toast.success('Added to cart.')
      }}
    >
      Add to Cart
    </Button>
  )
}
