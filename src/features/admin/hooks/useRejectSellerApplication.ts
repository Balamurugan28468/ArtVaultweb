import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/shared/ui'
import { isAdminActionError, rejectSellerApplication } from '../api/adminApi'
import { PENDING_SELLER_APPLICATIONS_QUERY_KEY } from './usePendingSellerApplications'

export interface RejectSellerApplicationInput {
  uid: string
  rejectionReason: string
}

/** See useApproveSellerApplication's doc comment — same isPending-as-guard, same authoritative-refetch-not-optimistic-removal design. */
export function useRejectSellerApplication() {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: ({ uid, rejectionReason }: RejectSellerApplicationInput) => rejectSellerApplication(uid, rejectionReason),
    onSuccess: () => {
      toast.success('Seller application rejected.')
      void queryClient.invalidateQueries({ queryKey: PENDING_SELLER_APPLICATIONS_QUERY_KEY })
    },
    onError: (error: unknown) => {
      toast.error(isAdminActionError(error) ? error.message : 'Something went wrong. Please try again.')
    },
  })
}
