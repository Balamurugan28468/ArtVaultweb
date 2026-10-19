import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/shared/ui'
import type { UserRole } from '@/features/auth/types'
import { isAdminActionError, setUserRole } from '../api/adminApi'
import { ADMIN_USERS_QUERY_KEY } from './useAdminUsers'

export interface SetUserRoleInput {
  uid: string
  role: UserRole
}

export function useSetUserRole() {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: ({ uid, role }: SetUserRoleInput) => setUserRole(uid, role),
    onSuccess: (_result, variables) => {
      toast.success(`User role updated to ${variables.role}.`)
      void queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY })
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

