import { useQuery } from '@tanstack/react-query'
import { getAdminAuditLogs } from '../api/adminQueueRepository'
import type { AdminAuditLogRecord } from '../types'

export const ADMIN_AUDIT_LOGS_QUERY_KEY = ['admin', 'audit-logs'] as const

export function useAdminAuditLogs() {
  return useQuery<AdminAuditLogRecord[], Error>({
    queryKey: ADMIN_AUDIT_LOGS_QUERY_KEY,
    queryFn: getAdminAuditLogs,
    staleTime: 30_000,
  })
}

