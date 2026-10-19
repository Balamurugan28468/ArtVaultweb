import { useState } from 'react'
import { Badge, Button, Card, EmptyState, ErrorState, Input, Skeleton } from '@/shared/ui'
import { RotateCw, ShieldCheck } from 'lucide-react'
import { useAdminPayments } from '../hooks/useAdminPayments'

export function AdminPaymentsView() {
  const { data: payments, status, error, refetch, isFetching } = useAdminPayments()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>('ALL')

  if (status === 'pending') {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading payments">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <ErrorState
        title="Could not load payments"
        description={error?.message || 'Something went wrong while loading payments oversight.'}
        action={
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        }
      />
    )
  }

  const paymentList = payments ?? []
  const filtered = paymentList.filter((p) => {
    if (filter !== 'ALL' && p.status !== filter) return false
    const query = search.toLowerCase().trim()
    if (!query) return true
    return (
      p.id.toLowerCase().includes(query) ||
      p.orderId.toLowerCase().includes(query) ||
      (p.providerOrderId?.toLowerCase().includes(query) ?? false) ||
      (p.providerPaymentId?.toLowerCase().includes(query) ?? false) ||
      p.provider.toLowerCase().includes(query) ||
      p.status.toLowerCase().includes(query)
    )
  })

  const formatPrice = (minor: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(minor / 100)
  }

  const getStatusTone = (s: string) => {
    switch (s) {
      case 'SUCCEEDED':
        return 'success'
      case 'PENDING':
        return 'gold'
      case 'FAILED':
      case 'CANCELLED':
        return 'danger'
      default:
        return 'neutral'
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-muted/60 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
        <div className="text-xs text-text-secondary">
          <span className="font-semibold text-text-primary">Read-Only Payment Oversight: </span>
          Displays verified provider payment IDs, amounts, and settlement states. No privileged server secrets
          or webhook keys are accessible from the frontend.
        </div>
      </div>

      {/* Filter and search */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {['ALL', 'SUCCEEDED', 'PENDING', 'FAILED'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === tab
                  ? 'bg-brand-primary text-text-primary'
                  : 'bg-surface-muted text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Search provider ref, payment ID, order ID…"
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
          title={search || filter !== 'ALL' ? 'No matching payment records' : 'No payments found'}
          description={
            search || filter !== 'ALL'
              ? 'Try adjusting your search query or filter.'
              : 'Captured transactions and gateway settlements will appear here.'
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((pay) => (
            <Card key={pay.id} className="flex flex-col gap-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-text-primary">{pay.provider}</span>
                    {pay.mode === 'TEST' && <Badge tone="gold">TEST MODE</Badge>}
                    <Badge tone={getStatusTone(pay.status)}>{pay.status}</Badge>
                    {pay.gatewayPhase && (
                      <Badge tone="neutral">Phase: {pay.gatewayPhase}</Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
                    <span>
                      Provider Order: <span className="font-mono text-text-primary">{pay.providerOrderId || '—'}</span>
                    </span>
                    <span>
                      Provider Payment: <span className="font-mono text-text-primary">{pay.providerPaymentId || '—'}</span>
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-lg font-bold text-text-primary">
                    {formatPrice(pay.amountMinor)}
                  </div>
                  <div className="text-xs text-text-muted">{pay.currency}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2 text-xs text-text-muted">
                <span>Associated Order ID: <span className="font-mono text-text-secondary">{pay.orderId}</span></span>
                <span>Created {new Date(pay.createdAt).toLocaleString()}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

