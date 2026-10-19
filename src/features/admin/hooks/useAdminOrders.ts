import { useQuery } from '@tanstack/react-query'
import { getAdminOrders } from '../api/adminQueueRepository'
import type { AdminOrderRecord } from '../types'

export const ADMIN_ORDERS_QUERY_KEY = ['admin', 'orders'] as const

export function useAdminOrders() {
  return useQuery<AdminOrderRecord[], Error>({
    queryKey: ADMIN_ORDERS_QUERY_KEY,
    queryFn: getAdminOrders,
    staleTime: 30_000,
  })
}

