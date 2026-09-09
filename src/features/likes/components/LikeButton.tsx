import { Star } from 'lucide-react'
import { useLike } from '../hooks/useLike'

/**
 * The Detail Page's "Appreciate" control (Module 12) — deliberately built
 * as its own icon-plus-count pill, not another round icon-only button like
 * `WishlistButton`, so the two are never visually confusable even though
 * they sit right next to each other in the same control cluster. A real
 * Star, not a second heart: liking and wishlisting are different actions
 * (one is a public, aggregate signal; the other is a private saved list)
 * and look it. Filled vs. outline star communicates state on its own — the
 * `fill` attribute itself changes, not just a color — matching
 * `WishlistButton`'s own "never color alone" approach; `aria-pressed`
 * carries the same state for assistive tech.
 */
export function LikeButton({ artworkId, likeCount, className = '' }: { artworkId: string; likeCount: number; className?: string }) {
  const { liked, count, pending, toggle } = useLike(artworkId, likeCount)

  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={liked ? 'Unlike this artwork' : 'Like this artwork'}
      title={liked ? 'Unlike this artwork' : 'Like this artwork'}
      disabled={pending}
      onClick={(event) => {
        // Sits inside the same header row as WishlistButton/ShareButton, not
        // inside a wrapping <Link> on this page — no navigation to guard
        // against — but propagation is still stopped defensively so a
        // future layout change can never make this also trigger one.
        event.preventDefault()
        event.stopPropagation()
        toggle()
      }}
      className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-text-secondary transition-colors duration-150 ease-standard hover:border-accent-gold hover:text-accent-gold disabled:cursor-not-allowed disabled:opacity-50 ${liked ? 'border-accent-gold text-accent-gold' : ''} ${className}`}
    >
      <Star
        aria-hidden="true"
        className="h-5 w-5 motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-90"
        fill={liked ? 'currentColor' : 'none'}
      />
      <span className="text-sm font-medium tabular-nums">{count}</span>
    </button>
  )
}
