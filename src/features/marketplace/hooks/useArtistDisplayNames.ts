import { useQueries } from '@tanstack/react-query'
import { getArtistDisplayName } from '@/features/artist-profile'

/**
 * Resolves each distinct sellerId on the current Marketplace page to its
 * public artist display name, one one-shot read per id (deduplicated and
 * cached by TanStack Query, so scrolling back to an already-seen seller's
 * card never re-fetches). `staleTime: Infinity` is deliberate: a display
 * name changing mid-browse-session is not a case worth invalidating a
 * cache over, unlike the artist's own profile page, which still uses a
 * live subscription for its authoritative single-artist view.
 */
export function useArtistDisplayNames(sellerIds: string[]): Record<string, string | null> {
  const uniqueIds = Array.from(new Set(sellerIds))

  const results = useQueries({
    queries: uniqueIds.map((id) => ({
      queryKey: ['marketplace', 'artistDisplayName', id],
      queryFn: () => getArtistDisplayName(id),
      staleTime: Infinity,
    })),
  })

  const names: Record<string, string | null> = {}
  uniqueIds.forEach((id, index) => {
    names[id] = results[index]?.data ?? null
  })
  return names
}
