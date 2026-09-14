import { ImageOff } from 'lucide-react'
import { Link } from 'react-router'
import { ConfirmDeleteArtworkModal } from './ConfirmDeleteArtworkModal'
import { ConfirmRemoveFromSaleModal } from './ConfirmRemoveFromSaleModal'
import { useArtworkLifecycleActions } from '../hooks/useArtworkLifecycleActions'
import type { Artwork, ArtworkStatus } from '../types'
import { Badge, Card, useToast } from '@/shared/ui'

// Module 13 Phase 4 — every real status gets its own accurate label/tone.
// Before this, anything that wasn't SUBMITTED was labeled "Draft" — a real
// bug: a PUBLISHED or REJECTED artwork in a seller's own list was mislabeled
// as a draft and shown an active "Delete draft" button that firestore.rules
// would always deny (delete requires status == 'DRAFT'). SUSPENDED (admin
// moderation override, UI-03 final correction) is the one admin-enforcement
// status this codebase actually has a real transition for — see types.ts's
// own comment.
const STATUS_BADGE: Record<ArtworkStatus, { label: string; tone: 'neutral' | 'gold' | 'success' | 'danger' }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SUBMITTED: { label: 'Awaiting review', tone: 'gold' },
  PUBLISHED: { label: 'Published', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  SUSPENDED: { label: 'Suspended', tone: 'danger' },
}

const CATEGORY_LABEL: Record<Artwork['category'], string> = {
  painting: 'Painting',
  sculpture: 'Sculpture',
  photography: 'Photography',
  digital: 'Digital',
  other: 'Other',
}

function formatUpdatedAt(value: Artwork['updatedAt']): string {
  const date = value?.toDate?.()
  if (!date) return ''
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function ArtworkListItem({ artwork }: { artwork: Artwork }) {
  // SUBMITTED is the only status still locked to the owner. SUSPENDED used
  // to be locked the same way, but the seller artwork recovery/control pass
  // (UI-03 final correction) lets an owner edit, delete, or resubmit a
  // SUSPENDED artwork exactly like a REJECTED one — see ArtworkForm.tsx.
  const isLocked = artwork.status === 'SUBMITTED'
  const badge = STATUS_BADGE[artwork.status]
  const cover = artwork.images[0]
  const toast = useToast()
  const {
    canDelete,
    canRemoveFromSale,
    busy,
    confirmDeleteOpen,
    openDelete,
    closeDelete,
    confirmDelete,
    confirmRemoveOpen,
    openRemove,
    closeRemove,
    confirmRemove,
  } = useArtworkLifecycleActions(artwork)

  const handleConfirmDelete = async () => {
    const ok = await confirmDelete()
    toast[ok ? 'success' : 'error'](ok ? 'Artwork deleted.' : 'Something went wrong. Please try again.')
  }

  const handleConfirmRemove = async () => {
    const ok = await confirmRemove()
    toast[ok ? 'success' : 'error'](ok ? 'Removed from sale.' : 'Something went wrong. Please try again.')
  }

  return (
    <Card className="flex flex-col gap-0 overflow-hidden p-0 shadow-card">
      {/* Deliberately not a link itself — the card keeps exactly one real
          link (the explicit "Edit"/"View" action below), which is also
          the one place that correctly distinguishes "View" (SUBMITTED,
          read-only) from "Edit" (every other status). A second,
          thumbnail-sized link to the same destination would blur that
          distinction without adding real capability. */}
      <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden bg-surface-elevated">
        {cover ? (
          <img src={cover.url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <ImageOff aria-hidden="true" className="h-8 w-8 text-text-muted" />
        )}
        <div className="absolute top-2 left-2">
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-3 sm:p-3.5">
        <h3 className="truncate text-sm font-medium text-text-primary">{artwork.title}</h3>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral" size="sm">
            {CATEGORY_LABEL[artwork.category]}
          </Badge>
          <span className="text-sm text-text-secondary">₹{(artwork.price / 100).toFixed(0)}</span>
        </div>

        <p className="text-xs text-text-muted">
          {artwork.inventoryCount} in stock · Updated {formatUpdatedAt(artwork.updatedAt)}
        </p>

        {(artwork.status === 'REJECTED' || artwork.status === 'SUSPENDED') && artwork.rejectionReason && (
          <p className="line-clamp-2 text-xs text-danger">{artwork.rejectionReason}</p>
        )}

        {/* An explicit, labeled action — not just the implicit card-level
            click above — so every status with a legitimate edit path
            (DRAFT/PUBLISHED/REJECTED/SUSPENDED) also has an obvious,
            accessible text entry point. SUBMITTED still links through (to
            the same locked, read-only summary ArtworkForm already renders
            for it), labeled "View" rather than "Edit" since nothing there
            is actually editable. */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <Link
            to={`/seller-studio/artworks/${artwork.id}/edit`}
            className="text-sm font-medium text-brand-primary hover:underline"
          >
            {isLocked ? 'View' : 'Edit'}
          </Link>
          {/* Seller artwork recovery/control (UI-03 final correction) —
              owner-only removal controls, matching firestore.rules
              exactly: every status except SUBMITTED gets a real hard
              Delete (subtle danger styling, not a prominent button).
              PUBLISHED additionally gets "Remove from sale" (the
              PUBLISHED -> SUBMITTED transition — see
              useArtworkLifecycleActions) as a non-destructive alternative
              alongside Delete, not instead of it. */}
          {canDelete && (
            <button type="button" onClick={openDelete} className="text-sm font-medium text-danger hover:underline">
              Delete
            </button>
          )}
          {canRemoveFromSale && (
            <button type="button" onClick={openRemove} className="text-sm font-medium text-text-secondary hover:underline">
              Remove from sale
            </button>
          )}
        </div>
      </div>
      <ConfirmDeleteArtworkModal
        open={confirmDeleteOpen}
        onClose={closeDelete}
        onConfirm={handleConfirmDelete}
        busy={busy}
        artworkTitle={artwork.title}
      />
      <ConfirmRemoveFromSaleModal
        open={confirmRemoveOpen}
        onClose={closeRemove}
        onConfirm={handleConfirmRemove}
        busy={busy}
        artworkTitle={artwork.title}
      />
    </Card>
  )
}
