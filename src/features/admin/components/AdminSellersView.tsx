import { useState } from 'react'
import { Badge, Button, Card, EmptyState, ErrorState, Input, Skeleton } from '@/shared/ui'
import { CheckCircle, XCircle, AlertTriangle, RotateCw, RefreshCw } from 'lucide-react'
import { useAllSellers } from '../hooks/useAllSellers'
import { useApproveSellerApplication } from '../hooks/useApproveSellerApplication'
import { useRejectSellerApplication } from '../hooks/useRejectSellerApplication'
import { useSuspendSeller } from '../hooks/useSuspendSeller'
import { ModerationActionModal } from './ModerationActionModal'
import type { SellerApplication, SellerStatus } from '@/features/seller-studio'

type FilterStatus = 'ALL' | SellerStatus

export function AdminSellersView() {
  const { data: sellers, status, error, refetch, isFetching } = useAllSellers()
  const approve = useApproveSellerApplication()
  const reject = useRejectSellerApplication()
  const suspend = useSuspendSeller()

  const [filter, setFilter] = useState<FilterStatus>('ALL')
  const [search, setSearch] = useState('')
  const [modalState, setModalState] = useState<{
    open: boolean
    seller: SellerApplication | null
    mode: 'approve' | 'reject' | 'suspend'
  }>({
    open: false,
    seller: null,
    mode: 'approve',
  })

  if (status === 'pending') {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading sellers">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <ErrorState
        title="Could not load sellers"
        description={error?.message || 'Something went wrong while loading seller profiles.'}
        action={
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        }
      />
    )
  }

  const sellerList = sellers ?? []
  const filtered = sellerList.filter((s) => {
    if (filter !== 'ALL' && s.status !== filter) return false
    const query = search.toLowerCase().trim()
    if (!query) return true
    return (
      s.businessName.toLowerCase().includes(query) ||
      s.contactEmail.toLowerCase().includes(query) ||
      s.description.toLowerCase().includes(query)
    )
  })

  const isBusy = approve.isPending || reject.isPending || suspend.isPending

  function handleActionClick(seller: SellerApplication, mode: 'approve' | 'reject' | 'suspend') {
    setModalState({ open: true, seller, mode })
  }

  function handleConfirmModal(reason?: string) {
    if (!modalState.seller) return
    const uid = modalState.seller.uid

    if (modalState.mode === 'approve') {
      approve.mutate(uid, {
        onSuccess: () => setModalState({ open: false, seller: null, mode: 'approve' }),
      })
    } else if (modalState.mode === 'reject') {
      reject.mutate(
        { uid, rejectionReason: reason ?? '' },
        { onSuccess: () => setModalState({ open: false, seller: null, mode: 'approve' }) },
      )
    } else if (modalState.mode === 'suspend') {
      suspend.mutate(
        { uid, reason: reason ?? '' },
        { onSuccess: () => setModalState({ open: false, seller: null, mode: 'approve' }) },
      )
    }
  }

  const getTone = (s: SellerStatus) => {
    switch (s) {
      case 'APPROVED':
        return 'success'
      case 'PENDING':
        return 'gold'
      case 'REJECTED':
      case 'SUSPENDED':
        return 'danger'
      default:
        return 'neutral'
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Search and filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {(['ALL', 'PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED'] as FilterStatus[]).map((tab) => (
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
            placeholder="Search business, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
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
          title={search || filter !== 'ALL' ? 'No matching sellers' : 'No sellers found'}
          description={
            search || filter !== 'ALL'
              ? 'Try adjusting your search or status filter.'
              : 'Registered sellers will appear here for management.'
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((s) => (
            <Card key={s.uid} className="flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-text-primary">{s.businessName}</h3>
                  <p className="text-sm text-text-secondary">{s.contactEmail}</p>
                </div>
                <Badge tone={getTone(s.status)}>{s.status}</Badge>
              </div>

              <p className="text-sm text-text-secondary">{s.description}</p>

              {s.rejectionReason && (
                <div className="rounded-lg bg-surface-muted p-3 text-xs text-text-secondary">
                  <span className="font-semibold text-text-primary">Reason note: </span>
                  {s.rejectionReason}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-3">
                <span className="text-xs text-text-muted">
                  Applied: {s.appliedAt.toDate().toLocaleDateString()}
                  {s.reviewedAt && ` • Reviewed: ${s.reviewedAt.toDate().toLocaleDateString()}`}
                </span>

                <div className="flex flex-wrap gap-2">
                  {s.status === 'PENDING' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleActionClick(s, 'approve')}
                        disabled={isBusy}
                      >
                        <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleActionClick(s, 'reject')}
                        disabled={isBusy}
                      >
                        <XCircle className="mr-1.5 h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </>
                  )}

                  {s.status === 'APPROVED' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="border-danger/30 text-danger hover:bg-danger/10"
                      onClick={() => handleActionClick(s, 'suspend')}
                      disabled={isBusy}
                    >
                      <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                      Suspend Seller
                    </Button>
                  )}

                  {s.status === 'SUSPENDED' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleActionClick(s, 'approve')}
                      disabled={isBusy}
                    >
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      Reinstate Seller
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Shared Action Modal */}
      <ModerationActionModal
        open={modalState.open}
        onClose={() => setModalState({ open: false, seller: null, mode: 'approve' })}
        title={
          modalState.mode === 'approve'
            ? `Approve "${modalState.seller?.businessName}"?`
            : modalState.mode === 'reject'
              ? `Reject seller application for "${modalState.seller?.businessName}"?`
              : `Suspend seller "${modalState.seller?.businessName}"?`
        }
        description={
          modalState.mode === 'approve'
            ? 'Approving assigns the SELLER role and creates their public artist profile.'
            : modalState.mode === 'reject'
              ? 'Rejecting keeps this application archived. Please provide an explicit reason.'
              : 'Suspending this seller immediately prevents new draft uploads, cart checkouts, and payment settlement for their artworks.'
        }
        requireReason={modalState.mode !== 'approve'}
        confirmLabel={
          modalState.mode === 'approve'
            ? 'Approve'
            : modalState.mode === 'reject'
              ? 'Reject Application'
              : 'Suspend Seller'
        }
        isSubmitting={isBusy}
        onConfirm={handleConfirmModal}
      />
    </div>
  )
}

