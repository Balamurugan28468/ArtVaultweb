import { Button, Modal } from '@/shared/ui'

/**
 * Delete confirmation for a saved address — mirrors
 * `ConfirmDeleteArtworkModal`'s pattern (name the item explicitly, disable
 * both actions while the delete is in flight).
 */
export function ConfirmDeleteAddressModal({
  open,
  onClose,
  onConfirm,
  busy,
  addressName,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  busy: boolean
  addressName: string
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete this address?"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={busy} className="!bg-danger text-white hover:!bg-danger/90">
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-text-secondary">
        Delete <span className="font-medium text-text-primary">&ldquo;{addressName}&rdquo;</span>? This action cannot be undone.
      </p>
    </Modal>
  )
}
