import { useQuery } from '@tanstack/react-query'
import { fetchCategoryArtworkCounts } from '../api/marketplaceRepository'

/**
 * Real published-artwork counts for Explore's sidebar/category strip (see
 * fetchCategoryArtworkCounts' own comment on why this one query is worth
 * it). `staleTime: Infinity` — like `useArtistDisplayNames` — a count that's
 * a few minutes stale is not worth invalidating a cache over; the numbers
 * refresh naturally on the next full page load/navigation.
 */
export function useCategoryArtworkCounts() {
  return useQuery({
    queryKey: ['marketplace', 'categoryArtworkCounts'],
    queryFn: fetchCategoryArtworkCounts,
    staleTime: Infinity,
  })
}
