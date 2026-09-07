import { useQueries } from '@tanstack/react-query'
import { getArtwork, type Artwork } from '@/features/artwork'
import { useWishlist } from '../context/WishlistProvider'

export interface WishlistArtworksResult {
  /** Only the ids that still resolve to a real artwork — see `unavailableCount`. */
  artworks: Artwork[]
  /** Saved ids whose artwork no longer resolves (deleted, or no longer PUBLISHED) — shown as a count, not silently dropped. */
  unavailableCount: number
  isLoading: boolean
}

/**
 * Resolves the current session's saved artwork ids (from WishlistProvider —
 * one shared id set, however many ids there are) into their *live* Artwork
 * data, one one-shot read per id via getArtwork, deduplicated and cached by
 * TanStack Query exactly like useArtistDisplayNames (Module 08) — never a
 * listener per artwork. A saved id whose artwork has since been deleted or
 * unpublished simply resolves to `null` and is excluded from `artworks`
 * rather than crashing or showing stale data, with its own count surfaced
 * so the page can say so honestly instead of silently showing fewer items
 * than were actually saved.
 */
export function useWishlistArtworks(): WishlistArtworksResult {
  const { savedIds, status } = useWishlist()
  const ids = Array.from(savedIds)

  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['wishlist', 'artwork', id],
      queryFn: () => getArtwork(id),
      staleTime: 30_000,
    })),
  })

  const isLoading = status === 'loading' || results.some((result) => result.isLoading)
  const artworks = results
    .map((result) => result.data)
    .filter((artwork): artwork is Artwork => artwork !== null && artwork !== undefined)
  const unavailableCount = ids.length - artworks.length

  return { artworks, unavailableCount: isLoading ? 0 : unavailableCount, isLoading }
}
