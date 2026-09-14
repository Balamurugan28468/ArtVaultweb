import { Button, Modal } from '@/shared/ui'

/**
 * UI-03 final correction — shared by the My Artworks cards and the Seller
 * Studio dashboard's Inventory Overview for deleting an owner's own DRAFT
 * or REJECTED artwork (the two statuses firestore.rules' `allow delete`
 * permits). Distinct from `ConfirmDeleteDraftModal` (the artwork edit
 * screen's own "Discard draft" flow, DRAFT-only and unaffected by this
 * change) — this one names the artwork explicitly, since a list of many
 * cards needs that context a single edit screen doesn't.
 */
export function ConfirmDeleteArtworkModal({
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
      title="Delete this artwork?"
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
        Delete <span className="font-medium text-text-primary">&ldquo;{artworkTitle}&rdquo;</span>? This action cannot be undone.
      </p>
    </Modal>
  )
}
