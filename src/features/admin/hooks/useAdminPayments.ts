import { useQuery } from '@tanstack/react-query'
import { getAdminPayments } from '../api/adminQueueRepository'
import type { AdminPaymentRecord } from '../types'

export const ADMIN_PAYMENTS_QUERY_KEY = ['admin', 'payments'] as const

export function useAdminPayments() {
  return useQuery<AdminPaymentRecord[], Error>({
    queryKey: ADMIN_PAYMENTS_QUERY_KEY,
    queryFn: getAdminPayments,
    staleTime: 30_000,
  })
}

