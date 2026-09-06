import { useInfiniteQuery } from '@tanstack/react-query'
import { fetchMarketplacePage } from '../api/marketplaceRepository'
import type { MarketplaceCursor, MarketplaceFilters } from '../types'

/**
 * Marketplace is the first feature in this codebase to read Firestore
 * through TanStack Query rather than a subscribeX/useX repository pair —
 * deliberately: it's a one-shot, cursor-paginated "load more" read, not a
 * live subscription (see docs/ARCHITECTURE.md's "Server/backend data:
 * TanStack Query" scope, and marketplaceRepository.ts). The query key
 * includes every filter, so changing category/price/sort starts a fresh
 * paginated result set instead of appending onto stale pages.
 */
export function useMarketplaceArtworks(filters: MarketplaceFilters) {
  return useInfiniteQuery({
    queryKey: ['marketplace', 'artworks', filters],
    queryFn: ({ pageParam }: { pageParam: MarketplaceCursor | null }) => fetchMarketplacePage(filters, pageParam),
    initialPageParam: null as MarketplaceCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
}
