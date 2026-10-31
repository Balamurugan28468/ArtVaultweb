import { useQuery } from '@tanstack/react-query'
import { getAdminDashboardMetrics } from '../api/adminQueueRepository'
import type { AdminDashboardMetrics } from '../types'

export const ADMIN_DASHBOARD_METRICS_QUERY_KEY = ['admin', 'dashboard-metrics'] as const

export function useAdminDashboardMetrics() {
  return useQuery<AdminDashboardMetrics, Error>({
    queryKey: ADMIN_DASHBOARD_METRICS_QUERY_KEY,
    queryFn: getAdminDashboardMetrics,
    staleTime: 30_000,
  })
}

