import { useQuery } from '@tanstack/react-query'
import { getSubmittedArtworks } from '../api/adminQueueRepository'

export const SUBMITTED_ARTWORKS_QUERY_KEY = ['admin', 'artworks', 'submitted'] as const

/** One-shot read, refetched explicitly after a successful moderation decision (see useModerateArtwork) rather than kept live. */
export function useSubmittedArtworks() {
  return useQuery({
    queryKey: SUBMITTED_ARTWORKS_QUERY_KEY,
    queryFn: getSubmittedArtworks,
  })
}
