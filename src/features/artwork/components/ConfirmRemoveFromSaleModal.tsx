import { Button, Modal } from '@/shared/ui'

/**
 * UI-03 final correction — a PUBLISHED artwork can never be hard-deleted
 * (firestore.rules' `allow delete` only ever matches DRAFT/REJECTED), so
 * this is the owner-facing confirmation for the one safe transition that
 * takes it off the public marketplace instead: PUBLISHED -> SUBMITTED with
 * no content changed (see `removeArtworkFromSale`). The copy says plainly
 * that the listing re-enters review rather than being deleted — never a
 * silent surprise about where the artwork actually goes.
 */
export function ConfirmRemoveFromSaleModal({
  open,
  onClose,
  onConfirm,
  busy,
  artworkTitle,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  busy: boolean
  artworkTitle: string
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Remove from sale?"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={busy}>
            {busy ? 'Removing…' : 'Remove from sale'}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-text-secondary">
        <span className="font-medium text-text-primary">&ldquo;{artworkTitle}&rdquo;</span> will be taken off the marketplace
        immediately. It won&apos;t be deleted, but it will need to pass admin review again before it can be published.
      </p>
    </Modal>
  )
}
