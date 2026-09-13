import { useQuery } from '@tanstack/react-query'
import type { Artwork, ArtworkCategory } from '@/features/artwork'
import { fetchMarketplacePage } from '../api/marketplaceRepository'
import { DEFAULT_MARKETPLACE_FILTERS } from '../types'

const RELATED_COUNT = 4

/**
 * "More in {category}" for the Artwork Detail page (UI-01) — reuses the
 * exact same Firestore-native Marketplace query Explore already runs
 * (category filter, newest-first), one-shot rather than paginated, since
 * this only ever needs a handful of results. Deliberately not labeled or
 * treated as "AI recommended" anywhere it's used: nothing here is
 * personalized or ranked by anything but recency (see docs/AI_ARCHITECTURE.md
 * — no AI gateway exists yet), so calling it AI-produced would be dishonest.
 */
export function useRelatedArtworks(category: ArtworkCategory | undefined, excludeId: string | undefined) {
  const query = useQuery({
    queryKey: ['marketplace', 'related', category],
    queryFn: () => fetchMarketplacePage({ ...DEFAULT_MARKETPLACE_FILTERS, category: category ?? null }, null),
    enabled: !!category,
  })

  const artworks = (query.data?.artworks ?? [])
    .filter((artwork): artwork is Artwork => artwork.id !== excludeId)
    .slice(0, RELATED_COUNT)

  return { status: query.status, artworks }
}
