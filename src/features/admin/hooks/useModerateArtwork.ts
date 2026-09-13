import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/shared/ui'
import { isAdminActionError, moderateArtwork } from '../api/adminApi'
import { SUBMITTED_ARTWORKS_QUERY_KEY } from './useSubmittedArtworks'

export interface ModerateArtworkInput {
  artworkId: string
  decision: 'PUBLISHED' | 'REJECTED'
  rejectionReason?: string
}

/** See useApproveSellerApplication's doc comment — same isPending-as-guard, same authoritative-refetch-not-optimistic-removal design. */
export function useModerateArtwork() {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: ({ artworkId, decision, rejectionReason }: ModerateArtworkInput) =>
      moderateArtwork(artworkId, decision, rejectionReason),
    onSuccess: (_result, variables) => {
      toast.success(variables.decision === 'PUBLISHED' ? 'Artwork published.' : 'Artwork rejected.')
      void queryClient.invalidateQueries({ queryKey: SUBMITTED_ARTWORKS_QUERY_KEY })
    },
    onError: (error: unknown) => {
      toast.error(isAdminActionError(error) ? error.message : 'Something went wrong. Please try again.')
    },
  })
}
