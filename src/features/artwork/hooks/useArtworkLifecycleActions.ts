import { useState } from 'react'
import { useUpdateArtwork } from './useUpdateArtwork'
import type { Artwork } from '../types'

/**
 * UI-03 final correction — shared by the My Artworks cards and the Seller
 * Studio dashboard's Inventory Overview, so both surfaces drive the exact
 * same owner-authorized mutations (`useUpdateArtwork`'s `remove`/
 * `removeFromSale`, themselves backed by firestore.rules) instead of each
 * re-implementing its own copy of this confirm-dialog/mutation wiring.
 * `canDelete` matches firestore.rules' own `allow delete` exactly — every
 * status except SUBMITTED (seller artwork recovery/control pass: DRAFT,
 * REJECTED, SUSPENDED, and now PUBLISHED too, are all owner-deletable;
 * PUBLISHED is simply the one status that also gets `canRemoveFromSale`
 * alongside it, a non-destructive alternative that stays available even
 * though hard Delete now also is). SUBMITTED gets neither, matching the
 * rule that never grants either write while SUBMITTED.
 */
export function useArtworkLifecycleActions(artwork: Artwork) {
  const { remove, removeFromSale, status, error } = useUpdateArtwork()
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)

  const canDelete = artwork.status !== 'SUBMITTED'
  const canRemoveFromSale = artwork.status === 'PUBLISHED'
  const busy = status === 'saving'

  async function confirmDelete() {
    try {
      await remove(artwork.id, artwork.images)
      setConfirmDeleteOpen(false)
      return true
    } catch {
      setConfirmDeleteOpen(false)
      return false
    }
  }

  async function confirmRemove() {
    try {
      await removeFromSale(artwork.id)
      setConfirmRemoveOpen(false)
      return true
    } catch {
      setConfirmRemoveOpen(false)
      return false
    }
  }

  return {
    canDelete,
    canRemoveFromSale,
    busy,
    error,
    confirmDeleteOpen,
    openDelete: () => setConfirmDeleteOpen(true),
    closeDelete: () => setConfirmDeleteOpen(false),
    confirmDelete,
    confirmRemoveOpen,
    openRemove: () => setConfirmRemoveOpen(true),
    closeRemove: () => setConfirmRemoveOpen(false),
    confirmRemove,
  }
}
