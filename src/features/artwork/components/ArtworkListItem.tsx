import { useState } from 'react'
import { Link } from 'react-router'
import { ConfirmDeleteDraftModal } from './ConfirmDeleteDraftModal'
import { useUpdateArtwork } from '../hooks/useUpdateArtwork'
import type { Artwork, ArtworkStatus } from '../types'
import { Badge, Card, useToast } from '@/shared/ui'

// Module 13 Phase 4 — every real status gets its own accurate label/tone.
// Before this, anything that wasn't SUBMITTED was labeled "Draft" — a real
// bug: a PUBLISHED or REJECTED artwork in a seller's own list was mislabeled
// as a draft and shown an active "Delete draft" button that firestore.rules
// would always deny (delete requires status == 'DRAFT').
const STATUS_BADGE: Record<ArtworkStatus, { label: string; tone: 'neutral' | 'gold' | 'success' | 'danger' }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SUBMITTED: { label: 'Awaiting review', tone: 'gold' },
  PUBLISHED: { label: 'Published', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
}

export function ArtworkListItem({ artwork }: { artwork: Artwork }) {
  const isDraft = artwork.status === 'DRAFT'
  const isSubmitted = artwork.status === 'SUBMITTED'
  const badge = STATUS_BADGE[artwork.status]
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const { remove, status } = useUpdateArtwork()
  const toast = useToast()

  const handleConfirmDelete = async () => {
    try {
      await remove(artwork.id, artwork.images)
      setConfirmDeleteOpen(false)
      toast.success('Draft deleted.')
    } catch (error) {
      setConfirmDeleteOpen(false)
      toast.error(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
    }
  }

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-medium text-text-primary">{artwork.title}</h3>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
        <p className="text-sm text-text-secondary">₹{(artwork.price / 100).toFixed(0)}</p>
        <p className="text-xs text-text-muted">{artwork.inventoryCount} in stock</p>
        {artwork.status === 'REJECTED' && artwork.rejectionReason && (
          <p className="line-clamp-2 text-xs text-danger">{artwork.rejectionReason}</p>
        )}
      </div>
      {/* An explicit, labeled action — not just an implicit whole-card click —
          so every status with a legitimate edit path (DRAFT/PUBLISHED/
          REJECTED) has an obvious, accessible entry point. SUBMITTED still
          links through (to the same locked, read-only summary
          ArtworkForm already renders for it), labeled "View" rather than
          "Edit" since nothing there is actually editable. */}
      <div className="flex items-center justify-between gap-2">
        <Link
          to={`/seller-studio/artworks/${artwork.id}/edit`}
          className="text-sm font-medium text-brand-primary hover:underline"
        >
          {isSubmitted ? 'View' : 'Edit'}
        </Link>
        {isDraft && (
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="text-sm font-medium text-danger hover:underline"
          >
            Delete draft
          </button>
        )}
      </div>
      <ConfirmDeleteDraftModal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
        busy={status === 'saving'}
      />
    </Card>
  )
}
