import { useState } from 'react'
import { Button, EmptyState, ErrorState, Skeleton } from '@/shared/ui'
import { useApproveSellerApplication } from '../hooks/useApproveSellerApplication'
import { usePendingSellerApplications } from '../hooks/usePendingSellerApplications'
import { useRejectSellerApplication } from '../hooks/useRejectSellerApplication'
import { ModerationActionModal } from './ModerationActionModal'
import { SellerApplicationCard } from './SellerApplicationCard'

type Dialog = { uid: string; businessName: string; mode: 'approve' | 'reject' } | null

/**
 * The full seller-application review surface: loading/error/empty/populated
 * states, one confirm/reason dialog shared across every row (never one
 * dialog instance per card — there is only ever at most one open at a
 * time). Every privileged write goes through useApproveSellerApplication/
 * useRejectSellerApplication, which call the Phase 1/2-hardened callables —
 * this component never touches sellers/{uid} directly.
 */
export function SellerApplicationQueue() {
  const query = usePendingSellerApplications()
  const approve = useApproveSellerApplication()
  const reject = useRejectSellerApplication()
  const [dialog, setDialog] = useState<Dialog>(null)

  const activeMutation = dialog?.mode === 'reject' ? reject : approve

  if (query.status === 'pending') {
    return (
      <div aria-busy="true" aria-label="Loading pending seller applications" className="flex flex-col gap-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (query.status === 'error') {
    return (
      <ErrorState
        title="Couldn't load seller applications"
        description="Something went wrong while loading the review queue."
        action={
          <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
            Try again
          </Button>
        }
      />
    )
  }

  const applications = query.data
  if (applications.length === 0) {
    return (
      <EmptyState
        title="No pending seller applications"
        description="New seller applications will appear here for review."
      />
    )
  }

  function closeDialog() {
    if (activeMutation.isPending) return
    setDialog(null)
  }

  function handleConfirm(reason?: string) {
    if (!dialog) return
    if (dialog.mode === 'approve') {
      approve.mutate(dialog.uid, { onSuccess: () => setDialog(null) })
    } else {
      reject.mutate({ uid: dialog.uid, rejectionReason: reason ?? '' }, { onSuccess: () => setDialog(null) })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {applications.map((application) => (
        <SellerApplicationCard
          key={application.uid}
          application={application}
          disabled={activeMutation.isPending}
          onApprove={() => setDialog({ uid: application.uid, businessName: application.businessName, mode: 'approve' })}
          onReject={() => setDialog({ uid: application.uid, businessName: application.businessName, mode: 'reject' })}
        />
      ))}

      <ModerationActionModal
        open={dialog !== null}
        onClose={closeDialog}
        title={dialog?.mode === 'approve' ? 'Approve seller application' : 'Reject seller application'}
        description={
          dialog
            ? dialog.mode === 'approve'
              ? `${dialog.businessName} will be granted seller access and a public artist profile.`
              : `${dialog.businessName}'s application will be marked as rejected. This cannot be undone from here.`
            : ''
        }
        requireReason={dialog?.mode === 'reject'}
        confirmLabel={dialog?.mode === 'approve' ? 'Approve' : 'Reject application'}
        isSubmitting={activeMutation.isPending}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
