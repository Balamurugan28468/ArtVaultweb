import { useQuery } from '@tanstack/react-query'
import { getAdminUsers } from '../api/adminQueueRepository'
import type { AdminUserRecord } from '../types'

export const ADMIN_USERS_QUERY_KEY = ['admin', 'users'] as const

export function useAdminUsers() {
  return useQuery<AdminUserRecord[], Error>({
    queryKey: ADMIN_USERS_QUERY_KEY,
    queryFn: getAdminUsers,
    staleTime: 30_000,
  })
}

