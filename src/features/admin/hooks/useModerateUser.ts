import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/shared/ui'
import { isAdminActionError, moderateUser } from '../api/adminApi'
import { ADMIN_USERS_QUERY_KEY } from './useAdminUsers'
import { ADMIN_DASHBOARD_METRICS_QUERY_KEY } from './useAdminDashboardMetrics'

export interface ModerateUserInput {
  uid: string
  decision: 'ACTIVE' | 'SUSPENDED'
  reason?: string
}

export function useModerateUser() {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: ({ uid, decision, reason }: ModerateUserInput) =>
      moderateUser(uid, decision, reason),
    onSuccess: (_result, variables) => {
      toast.success(
        variables.decision === 'SUSPENDED'
          ? 'User suspended.'
          : 'User account restored to active.',
      )
      void queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY })
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

