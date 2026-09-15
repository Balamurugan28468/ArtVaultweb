import { useQuery } from '@tanstack/react-query'
import { fetchTrendingArtworks } from '@/features/marketplace'

/** "Trending Now" — real, always-available (no sign-in required): the most-liked PUBLISHED artworks right now, by the real `likeCount` field. Never a fabricated trending score. */
export function useTrendingArtworks() {
  return useQuery({
    queryKey: ['recommendations', 'trending'],
    queryFn: fetchTrendingArtworks,
  })
}
