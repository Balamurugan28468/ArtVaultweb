import { Heart } from 'lucide-react'
import { useWishlist } from '../context/WishlistProvider'

/**
 * The save/heart toggle overlaid on an artwork's cover image (Marketplace
 * and the artist page both use PublicArtworkCard, so this lights up
 * everywhere an artwork is shown, not just one surface). A real `<button>`,
 * not a styled `<div>` — full keyboard/screen-reader operability for free.
 *
 * Saved state is communicated two ways at once (fill, not just color) so it
 * never depends on color alone: `fill="currentColor"` on the heart icon
 * plus `aria-pressed`, matching WCAG's "don't rely on color alone" guidance
 * directly rather than as an afterthought. 44px square (h-11 w-11, matching
 * IconButton's own established minimum target size elsewhere in this
 * codebase) with a semi-opaque, blurred dark backdrop so it stays legible
 * over any artwork's own colors — a plain "ghost" hover treatment (which
 * assumes a surface-colored background) wouldn't work reliably here.
 */
export function WishlistButton({ artworkId, className = '' }: { artworkId: string; className?: string }) {
  const { isSaved, toggle } = useWishlist()
  const saved = isSaved(artworkId)

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
      title={saved ? 'Remove from wishlist' : 'Save to wishlist'}
      onClick={(event) => {
        // Cards wrap this button in a <Link> to the artist page (see
        // MarketplaceGrid/PublicArtworkGrid) — saving must never also
        // trigger that navigation.
        event.preventDefault()
        event.stopPropagation()
        void toggle(artworkId)
      }}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-transform duration-150 ease-standard hover:bg-black/60 motion-safe:hover:scale-105 motion-safe:active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <Heart aria-hidden="true" className="h-5 w-5" fill={saved ? 'currentColor' : 'none'} />
    </button>
  )
}
