import { PublicArtworkGrid } from '@/features/artwork'

/**
 * Public artwork section for an artist's profile page (Module 06/07). A
 * thin wrapper around the artwork feature's own PublicArtworkGrid — never
 * hardcodes an id (see ArtistProfilePage, which passes the real, resolved
 * profile's own `uid`), and never reaches into artwork's internals
 * directly, only through its public index. `artistId` is the same value as
 * the seller's own uid (see docs/DATABASE.md), so this queries exactly
 * that seller's real PUBLISHED artworks — DRAFT/SUBMITTED/REJECTED ones are
 * never fetched at all, not merely hidden, since the underlying query
 * itself only ever matches `status == 'PUBLISHED'`.
 */
export function PublicArtistArtworks({ artistId }: { artistId: string }) {
  return <PublicArtworkGrid sellerId={artistId} />
}
