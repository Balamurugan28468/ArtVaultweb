import { useQueries } from '@tanstack/react-query'
import { getArtwork, type Artwork } from '@/features/artwork'

/**
 * Resolves each distinct linked artworkId to its live Artwork data, one
 * one-shot read per id, deduplicated/cached by TanStack Query — the same
 * pattern useArtistDisplayNames/useWishlistArtworks already use. A missing
 * or unavailable artwork resolves to `null` rather than dropping the
 * auction card entirely (see AuctionCard's own `artwork: null` handling).
 */
export function useAuctionArtworks(artworkIds: string[]): Record<string, Artwork | null> {
  const uniqueIds = Array.from(new Set(artworkIds))

  const results = useQueries({
    queries: uniqueIds.map((id) => ({
      queryKey: ['auctions', 'artwork', id],
      queryFn: () => getArtwork(id),
      staleTime: 30_000,
    })),
  })

  const artworks: Record<string, Artwork | null> = {}
  uniqueIds.forEach((id, index) => {
    artworks[id] = results[index]?.data ?? null
  })
  return artworks
}
