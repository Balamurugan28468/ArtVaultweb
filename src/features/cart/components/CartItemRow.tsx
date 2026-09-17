import { useState } from 'react'
import { CART_MAX_QUANTITY } from '../types'
import { Heart, ImageOff, Minus, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { useWishlist } from '@/features/wishlist'
import { Badge, Card, IconButton } from '@/shared/ui'
import type { CartLine } from '../hooks/useCartLines'

function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1)
}

/**
 * One line item on the Cart page. Quantity controls only ever step within
 * `[1, artwork.inventoryCount]` — the artwork's own real stock count (UI-02
 * scope explicitly limits quantity controls to cases the inventory model
 * actually supports, which this one does: Artwork already carries a real
 * `inventoryCount`, Module 04). A line whose stock has since dropped below
 * its saved quantity shows an honest "Only N left" warning rather than
 * silently clamping the cart's own stored quantity out from under the
 * shopper — the real clamp still happens (enforced server-side at a future
 * checkout, and client-side here on the stepper itself), but the
 * discrepancy stays visible.
 */
export function CartItemRow({
  line,
  artistDisplayName,
  onQuantityChange,
  onRemove,
}: {
  line: CartLine
  artistDisplayName?: string | null
  onQuantityChange: (quantity: number) => Promise<boolean> | void
  onRemove: () => Promise<boolean> | void
}) {
  const { artwork, quantity, lineTotal } = line
  const { isSaved, isPending: isWishlistPending, toggle: toggleWishlist } = useWishlist()
  const cover = artwork.images[0]
  const outOfStock = artwork.inventoryCount <= 0
  const overStock = !outOfStock && quantity > artwork.inventoryCount
  const atMax = quantity >= Math.min(artwork.inventoryCount, CART_MAX_QUANTITY)
  const [pending, setPending] = useState(false)
  const run = async (action: () => Promise<unknown> | void) => {
    setPending(true)
    try { await action() } finally { setPending(false) }
  }

  const handleMoveToWishlist = () => run(async () => {
    if (isWishlistPending?.(artwork.id)) return
    if (!isSaved(artwork.id) && !(await toggleWishlist(artwork.id))) return
    await onRemove()
  })

  return (
    <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:gap-4 sm:p-4">
      <Link
        to={`/artworks/${artwork.id}`}
        className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-elevated sm:h-28 sm:w-28"
      >
        {cover ? (
          <img src={cover.url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <ImageOff aria-hidden="true" className="h-6 w-6 text-text-muted" />
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={`/artworks/${artwork.id}`} className="min-w-0">
              <h3 className="font-display truncate text-sm font-medium text-text-primary hover:underline sm:text-base">
                {artwork.title}
              </h3>
            </Link>
            {artistDisplayName && <p className="truncate text-xs text-text-muted">{artistDisplayName}</p>}
          </div>
          <IconButton
            icon={<Trash2 className="h-4 w-4" />}
            label="Remove from cart"
            disabled={pending}
            onClick={() => void run(onRemove)}
            className="shrink-0 hover:text-danger"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="gold" size="sm">
            {categoryLabel(artwork.category)}
          </Badge>
          {outOfStock ? (
            <Badge tone="danger" size="sm">
              Out of stock
            </Badge>
          ) : overStock ? (
            <Badge tone="warning" size="sm">
              Only {artwork.inventoryCount} left — reduce quantity
            </Badge>
          ) : artwork.inventoryCount <= 5 ? (
            <Badge tone="warning" size="sm">
              Only {artwork.inventoryCount} left
            </Badge>
          ) : null}
        </div>

        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label={`Quantity for ${artwork.title}`}
              className="flex h-11 items-center rounded-md border border-border-strong"
            >
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={pending || quantity <= 1}
                onClick={() => void run(() => onQuantityChange(quantity - 1))}
                className="flex h-11 w-11 items-center justify-center text-text-secondary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-8 px-1 text-center text-sm font-medium text-text-primary" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={pending || outOfStock || atMax}
                onClick={() => void run(() => onQuantityChange(quantity + 1))}
                className="flex h-11 w-11 items-center justify-center text-text-secondary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              disabled={pending || isWishlistPending?.(artwork.id)}
              onClick={handleMoveToWishlist}
              className="inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-xs text-text-secondary hover:text-brand-primary-on-dark"
            >
              <Heart className="h-4 w-4" aria-hidden="true" />
              Save for later
            </button>
          </div>

          <div className="text-right">
            <p className="text-xs text-text-muted">₹{(artwork.price / 100).toFixed(0)} each</p>
            <p className="font-display text-base font-medium text-accent-gold sm:text-lg">₹{(lineTotal / 100).toFixed(0)}</p>
          </div>
        </div>
      </div>
    </Card>
  )
}
