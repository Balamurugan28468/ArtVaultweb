import { ImageOff } from 'lucide-react'
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
 */
export function PublicArtworkCard({
  artwork,
  artistDisplayName,
}: {
  artwork: Artwork
  artistDisplayName?: string | null
}) {
  const cover = artwork.images[0]

  return (
    <Card className="flex flex-col gap-2 overflow-hidden p-0">
      <div className="flex aspect-square items-center justify-center overflow-hidden bg-surface-elevated">
        {cover ? (
          <img src={cover.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageOff aria-hidden="true" className="h-8 w-8 text-text-muted" />
        )}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <h3 className="truncate text-sm font-medium text-text-primary">{artwork.title}</h3>
        {artistDisplayName && <p className="truncate text-xs text-text-muted">{artistDisplayName}</p>}
        <p className="text-sm text-text-secondary">₹{(artwork.price / 100).toFixed(0)}</p>
      </div>
    </Card>
  )
}
