import { Button, Modal } from '@/shared/ui'

/**
 * Shared between the My Artworks list and the draft edit screen — one
 * accessible confirmation (focus-trapped, Escape-to-close, focus returns to
 * whatever triggered it — all via the shared Modal/useFocusTrap) rather than
 * a native window.confirm(), which none of that applies to.
 */
export function ConfirmDeleteDraftModal({
  open,
  onClose,
  onConfirm,
  busy,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  busy: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete this draft?"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="!bg-danger text-white hover:!bg-danger/90"
          >
            {busy ? 'Deleting…' : 'Delete draft'}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-text-secondary">This action cannot be undone.</p>
    </Modal>
  )
}
