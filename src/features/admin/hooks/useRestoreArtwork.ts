import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/shared/ui'
import { isAdminActionError, restoreArtwork } from '../api/adminApi'
import { ALL_ARTWORKS_QUERY_KEY } from './useAllArtworks'
import { SUBMITTED_ARTWORKS_QUERY_KEY } from './useSubmittedArtworks'
import { ADMIN_DASHBOARD_METRICS_QUERY_KEY } from './useAdminDashboardMetrics'

export function useRestoreArtwork() {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: (artworkId: string) => restoreArtwork(artworkId),
    onSuccess: () => {
      toast.success('Artwork restored to published status.')
      void queryClient.invalidateQueries({ queryKey: ALL_ARTWORKS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: SUBMITTED_ARTWORKS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: ADMIN_DASHBOARD_METRICS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] })
    },
    onError: (error: unknown) => {
      toast.error(
        isAdminActionError(error)
          ? error.message
          : 'Something went wrong. Please try again.',
      )
    },
  })
}

