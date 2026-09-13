import { Box, ImageOff, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
// Imports the concrete file, not the `@/features/wishlist` barrel:
// WishlistGrid (that barrel's other consumer-facing export) needs Artwork
// data from *this* feature's own barrel, and importing the wishlist
// barrel here would make the two feature barrels import each other.
import { WishlistButton } from '@/features/wishlist/components/WishlistButton'
import type { Artwork } from '../types'
import { Card } from '@/shared/ui'

/**
 * Public, read-only — deliberately a separate component from
 * ArtworkListItem (Seller Studio's own card), which renders Draft/Submitted
 * badges, a "Delete draft" action, and links into the owner-only edit page.
 * None of that may ever appear on a public page; every artwork this
 * component is ever given is already guaranteed PUBLISHED by the query
 * that produced it (see usePublishedArtworks), so there is no status badge
 * here at all — showing "Published" on every single card would be
 * uninformative, not reassuring.
 *
 * `artistDisplayName` is optional and omitted entirely from rendering when
 * absent (Module 08) — the artist page (Module 06/07's own usage) never
 * passes it, since naming the artist on every card would be redundant on a
 * page that's already about that one artist; the Marketplace grid, which
 * spans many sellers, does.
 *
 * The Wishlist save control (Module 09) is unconditional, not an opt-in
 * prop — this component is only ever used for genuinely public artwork
 * (this page and Marketplace), so there is no context where saving
 * shouldn't be offered.
 *
 * Navigation (Module 11) is owned entirely by this component, not by its
 * callers: the image and title share one link into the artwork's own
 * `/artworks/:id` detail page (merged into a single tab stop rather than
 * two adjacent links to the same destination), and the artist name — when
 * shown — is a second, separate link into `/artists/:sellerId`. Every
 * caller (Marketplace, the artist page's own grid, Home, Wishlist) used to
 * wrap this whole card in its own single "go to the artist" `<Link>`; that
 * wrapping is gone now that the two destinations genuinely differ, so this
 * component must never again be rendered outside a Router context.
 *
 * The small AR/AI badges (UI-01's AR+AI product-wide requirement) are
 * deliberately compact, honest, and inert here — real "View in AR"/"AI
 * Artwork Analysis" actions belong to the Artwork Detail page (see
 * ArtworkDetailPage.tsx), not a dense card grid. Because this one component
 * is shared by every artwork-card surface (Home, Explore, Wishlist, Artist
 * Profile, "More in category"), adding the indicators here is what makes
 * them appear everywhere at once without duplicating markup per page.
 */
export function PublicArtworkCard({
  artwork,
  artistDisplayName,
}: {
  artwork: Artwork
  artistDisplayName?: string | null
}) {
  const cover = artwork.images[0]
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = cover && !imageFailed
  const artworkHref = `/artworks/${artwork.id}`

  return (
    <Card className="group flex flex-col gap-0 overflow-hidden p-0 shadow-card transition-all duration-200 ease-standard hover:-translate-y-0.5 hover:border-accent-gold/50 hover:shadow-elevated">
      <Link to={artworkHref} className="relative flex aspect-[4/5] items-center justify-center overflow-hidden bg-surface-elevated">
        {showImage ? (
          <img
            src={cover.url}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300 ease-standard motion-safe:group-hover:scale-105"
          />
        ) : (
          <ImageOff aria-hidden="true" className="h-8 w-8 text-text-muted" />
        )}
        {/* Bottom scrim purely for price/title legibility if a caller ever
            overlays text on the image — currently unused decoratively, kept
            deliberately subtle (a premium gallery card, not a poster). */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent opacity-0 transition-opacity duration-200 ease-standard group-hover:opacity-100" />
        {/* Color convention (UI-01): blue = AR, purple = AI — reused
            everywhere either appears (this card, ArtworkDetailPage, the
            AI Assistant launcher) so the two capabilities stay visually
            distinct at a glance, never interchangeable. */}
        <div className="absolute top-2 left-2 flex gap-1">
          <span
            role="button"
            aria-disabled="true"
            title="View in AR — coming soon"
            className="inline-flex h-6 w-6 cursor-not-allowed items-center justify-center rounded-full bg-blue-600/90 text-white backdrop-blur-sm sm:h-7 sm:w-7"
          >
            <Box aria-hidden="true" className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </span>
          <span
            role="button"
            aria-disabled="true"
            title="AI Artwork Analysis — coming soon"
            className="inline-flex h-6 w-6 cursor-not-allowed items-center justify-center rounded-full bg-brand-primary/90 text-white backdrop-blur-sm sm:h-7 sm:w-7"
          >
            <Sparkles aria-hidden="true" className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </span>
        </div>
        {/* Now nested inside the artwork Link above (previously nested
            inside a Card with no ancestor Link at all) — WishlistButton's
            own onClick already calls preventDefault()/stopPropagation()
            before toggling (see WishlistButton.tsx), which is exactly what
            stops this from ever triggering the surrounding Link's
            navigation; no change needed here. */}
        <WishlistButton artworkId={artwork.id} className="absolute top-2 right-2" />
      </Link>
      <div className="flex flex-col gap-1 p-2.5 sm:p-3.5">
        <Link to={artworkHref}>
          <h3 className="font-display truncate text-sm font-medium text-text-primary hover:underline sm:text-base">
            {artwork.title}
          </h3>
        </Link>
        {artistDisplayName && (
          <Link to={`/artists/${artwork.sellerId}`} className="truncate text-xs text-text-muted hover:text-text-secondary hover:underline">
            {artistDisplayName}
          </Link>
        )}
        <p className="font-display mt-0.5 text-base font-medium text-accent-gold sm:text-lg">₹{(artwork.price / 100).toFixed(0)}</p>
      </div>
    </Card>
  )
}
