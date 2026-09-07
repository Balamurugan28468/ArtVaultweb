import { ImageOff } from 'lucide-react'
import { useState } from 'react'
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

  return (
    <Card className="group flex flex-col gap-2 overflow-hidden p-0 transition-colors duration-150 ease-standard hover:border-brand-primary/60">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-surface-elevated">
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
        <WishlistButton artworkId={artwork.id} className="absolute top-2 right-2" />
      </div>
      <div className="flex flex-col gap-1 p-3">
        <h3 className="truncate text-sm font-medium text-text-primary">{artwork.title}</h3>
        {artistDisplayName && <p className="truncate text-xs text-text-muted">{artistDisplayName}</p>}
        <p className="text-sm font-semibold text-text-primary">₹{(artwork.price / 100).toFixed(0)}</p>
      </div>
    </Card>
  )
}
