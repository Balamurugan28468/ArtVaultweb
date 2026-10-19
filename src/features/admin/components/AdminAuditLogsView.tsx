import { useState } from 'react'
import { Badge, Button, Card, EmptyState, ErrorState, Input, Skeleton } from '@/shared/ui'
import { RotateCw, Shield, ArrowRight } from 'lucide-react'
import { useAdminAuditLogs } from '../hooks/useAdminAuditLogs'

export function AdminAuditLogsView() {
  const { data: logs, status, error, refetch, isFetching } = useAdminAuditLogs()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')

  if (status === 'pending') {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading audit logs">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <ErrorState
        title="Could not load audit log"
        description={error?.message || 'Something went wrong while loading the admin audit ledger.'}
        action={
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        }
      />
    )
  }

  const logList = logs ?? []
  const filtered = logList.filter((log) => {
    if (typeFilter !== 'ALL' && log.targetType.toLowerCase() !== typeFilter.toLowerCase()) return false
    const query = search.toLowerCase().trim()
    if (!query) return true
    return (
      log.action.toLowerCase().includes(query) ||
      log.targetId.toLowerCase().includes(query) ||
      log.targetType.toLowerCase().includes(query) ||
      (log.actorName?.toLowerCase().includes(query) ?? false) ||
      (log.reason?.toLowerCase().includes(query) ?? false)
    )
  })

  const getActionTone = (action: string) => {
    if (action.includes('APPROVED') || action.includes('PUBLISHED') || action.includes('ACTIVE') || action.includes('RESTORE')) {
      return 'success'
    }
    if (action.includes('SUSPENDED') || action.includes('REJECTED')) {
      return 'danger'
    }
    return 'gold'
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-muted/60 p-4">
        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-text-primary" />
        <div className="text-xs text-text-secondary">
          <span className="font-semibold text-text-primary">Append-Only Audit Ledger: </span>
          All administrative operations (moderation decisions, status suspensions, and role adjustments) are
          immutable and audited. Neither users nor administrators can edit or delete this history.
        </div>
      </div>

      {/* Filter and search */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {['ALL', 'seller', 'artwork', 'profile', 'user_role'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setTypeFilter(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                typeFilter === tab
                  ? 'bg-brand-primary text-text-primary'
                  : 'bg-surface-muted text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Search action, actor, target ID, reason…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RotateCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={search || typeFilter !== 'ALL' ? 'No matching audit records' : 'No audit records'}
          description={
            search || typeFilter !== 'ALL'
              ? 'Try adjusting your search terms or filter.'
              : 'Administrative decisions and role adjustments will be logged here.'
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((log) => (
            <Card key={log.id} className="flex flex-col gap-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={getActionTone(log.action)}>{log.action}</Badge>
                    <Badge tone="neutral">Target: {log.targetType}</Badge>
                    {log.previousState && log.newState && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                        <span className="rounded bg-surface-muted px-2 py-0.5 text-text-muted">
                          {log.previousState}
                        </span>
                        <ArrowRight className="h-3 w-3 text-text-muted" />
                        <span className="rounded bg-surface-muted px-2 py-0.5 text-text-primary">
                          {log.newState}
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-text-secondary">
                    Actor: <span className="font-medium text-text-primary">{log.actorName || 'Administrator'}</span>
                    <span className="font-mono text-xs text-text-muted"> ({log.actorId})</span>
                  </div>
                </div>

                <span className="text-xs text-text-muted">
                  {new Date(log.occurredAt).toLocaleString()}
                </span>
              </div>

              {log.reason && (
                <div className="rounded-lg bg-surface-muted p-2.5 text-xs text-text-secondary">
                  <span className="font-semibold text-text-primary">Logged reason: </span>
                  {log.reason}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2 text-[11px] text-text-muted">
                <span>Target ID: <span className="font-mono text-text-secondary">{log.targetId}</span></span>
                <span className="font-mono text-[10px] text-text-muted">Log ID: {log.id}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

