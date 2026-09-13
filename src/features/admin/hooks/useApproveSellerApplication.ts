import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/shared/ui'
import { approveSellerApplication, isAdminActionError } from '../api/adminApi'
import { PENDING_SELLER_APPLICATIONS_QUERY_KEY } from './usePendingSellerApplications'

/**
 * `mutation.isPending` is this hook's own built-in double-click guard —
 * components disable the Approve control while it's true rather than
 * tracking a second, redundant piece of local state. The server response is
 * authoritative: success invalidates the PENDING query (a real refetch, not
 * an optimistic local removal), so the approved application only ever
 * disappears from the queue once Firestore itself confirms it no longer
 * matches `status == 'PENDING'`.
 */
export function useApproveSellerApplication() {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: (uid: string) => approveSellerApplication(uid),
    onSuccess: () => {
      toast.success('Seller application approved.')
      void queryClient.invalidateQueries({ queryKey: PENDING_SELLER_APPLICATIONS_QUERY_KEY })
    },
    onError: (error: unknown) => {
      toast.error(isAdminActionError(error) ? error.message : 'Something went wrong. Please try again.')
    },
  })
}
