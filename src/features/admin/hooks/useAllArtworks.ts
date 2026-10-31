import { useQuery } from '@tanstack/react-query'
import { getAllArtworks } from '../api/adminQueueRepository'
import type { Artwork } from '@/features/artwork'

export const ALL_ARTWORKS_QUERY_KEY = ['admin', 'all-artworks'] as const

export function useAllArtworks() {
  return useQuery<Artwork[], Error>({
    queryKey: ALL_ARTWORKS_QUERY_KEY,
    queryFn: getAllArtworks,
    staleTime: 30_000,
  })
}

