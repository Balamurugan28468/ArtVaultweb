import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/shared/ui'
import { isAdminActionError, suspendSellerApplication } from '../api/adminApi'
import { ALL_SELLERS_QUERY_KEY } from './useAllSellers'
import { PENDING_SELLER_APPLICATIONS_QUERY_KEY } from './usePendingSellerApplications'
import { ADMIN_DASHBOARD_METRICS_QUERY_KEY } from './useAdminDashboardMetrics'

export interface SuspendSellerInput {
  uid: string
  reason: string
}

export function useSuspendSeller() {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: ({ uid, reason }: SuspendSellerInput) =>
      suspendSellerApplication(uid, reason),
    onSuccess: () => {
      toast.success('Seller suspended.')
      void queryClient.invalidateQueries({ queryKey: ALL_SELLERS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: PENDING_SELLER_APPLICATIONS_QUERY_KEY })
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

