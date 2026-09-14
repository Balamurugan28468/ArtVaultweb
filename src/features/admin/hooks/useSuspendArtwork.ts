import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/shared/ui'
import { isAdminActionError, suspendArtwork } from '../api/adminApi'
import { SUBMITTED_ARTWORKS_QUERY_KEY } from './useSubmittedArtworks'

export interface SuspendArtworkInput {
  artworkId: string
  reason: string
}

/**
 * Admin moderation override (UI-03 final correction) — same
 * isPending-as-guard, same authoritative-refetch-not-optimistic-removal
 * design as useModerateArtwork. Invalidates the submitted-artworks queue
 * too: the artwork being suspended may be one of today's SUBMITTED queue
 * items (an admin can suspend instead of publish/reject), and it must
 * disappear from that queue exactly as reliably as a real publish/reject
 * decision already does.
 */
export function useSuspendArtwork() {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: ({ artworkId, reason }: SuspendArtworkInput) => suspendArtwork(artworkId, reason),
    onSuccess: () => {
      toast.success('Artwork suspended and removed from the marketplace.')
      void queryClient.invalidateQueries({ queryKey: SUBMITTED_ARTWORKS_QUERY_KEY })
    },
    onError: (error: unknown) => {
      toast.error(isAdminActionError(error) ? error.message : 'Something went wrong. Please try again.')
    },
  })
}
