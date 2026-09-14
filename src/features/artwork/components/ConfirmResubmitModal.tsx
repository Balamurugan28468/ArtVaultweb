import { Button, Modal } from '@/shared/ui'

/**
 * Module 13 Phase 4 — shown before any write that moves a PUBLISHED,
 * REJECTED, or SUSPENDED (seller artwork recovery/control pass) artwork
 * back into the Admin moderation queue (SUBMITTED). Two copy variants share
 * one component since all three source statuses land on the exact same
 * underlying transition (firestore.rules treats them as one branch, not
 * separate ones): `material-change` warns about the real, easy-to-miss
 * consequence of editing a PUBLISHED artwork's public content — it stops
 * being visible in the marketplace until approved again, never a silent
 * surprise; `rejected-resubmit` makes the already-explicit "Edit &
 * resubmit" action doubly explicit for REJECTED or SUSPENDED, matching the
 * owner's own "explicit resubmission" requirement, even though neither has
 * any live marketplace visibility to lose.
 */
export function ConfirmResubmitModal({
  open,
  onClose,
  onConfirm,
  busy,
  variant,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  busy: boolean
  variant: 'material-change' | 'rejected-resubmit'
}) {
  const title = variant === 'material-change' ? 'These changes require admin review' : 'Resubmit for review?'
  const description =
    variant === 'material-change'
      ? "You changed the title, description, category, or photos — this artwork will return to review status and won't be visible in the marketplace until an admin approves it again. Price, inventory, and tag changes never require this."
      : 'This artwork will be resubmitted for admin review and will remain unpublished until approved.'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={busy}>
            {busy ? 'Submitting…' : 'Submit for review'}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-text-secondary">{description}</p>
    </Modal>
  )
}
