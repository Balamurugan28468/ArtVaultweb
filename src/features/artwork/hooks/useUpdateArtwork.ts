import { useCallback, useState } from 'react'
import { deleteArtworkImageObject } from '../api/artworkImageStorage'
import {
  deleteOwnedArtwork,
  removeArtworkFromSale,
  resubmitArtworkForReview,
  submitArtwork,
  updateArtworkDraft,
  updatePublishedArtworkSafeFields,
  type ArtworkSafeFieldsInput,
} from '../api/artworkRepository'
import { isArtworkError, type ArtworkDraftInput, type ArtworkError, type ArtworkImage } from '../types'

export type UpdateStatus = 'idle' | 'saving' | 'success' | 'error'

/**
 * Owns every mutation available on an existing artwork — sharing one
 * status/error so any one of them disables the others while in flight.
 * `updateSafeFields`/`resubmitForReview` are Module 13 Phase 4's own
 * additions for a PUBLISHED/REJECTED artwork's owner; see
 * artworkRepository.ts for why they're two distinct functions rather than
 * one that tries to infer intent from a diff.
 */
export function useUpdateArtwork() {
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [error, setError] = useState<ArtworkError | null>(null)

  const runMutation = useCallback(async (mutation: () => Promise<void>): Promise<void> => {
    setStatus('saving')
    setError(null)
    try {
      await mutation()
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setError(isArtworkError(err) ? err : { code: 'unknown', message: 'Something went wrong. Please try again.' })
      throw err
    }
  }, [])

  const update = useCallback((id: string, input: ArtworkDraftInput) => runMutation(() => updateArtworkDraft(id, input)), [runMutation])
  const submit = useCallback((id: string) => runMutation(() => submitArtwork(id)), [runMutation])
  const updateSafeFields = useCallback(
    (id: string, input: ArtworkSafeFieldsInput) => runMutation(() => updatePublishedArtworkSafeFields(id, input)),
    [runMutation],
  )
  const resubmitForReview = useCallback(
    (id: string, input: ArtworkDraftInput, images: ArtworkImage[]) => runMutation(() => resubmitArtworkForReview(id, input, images)),
    [runMutation],
  )
  // Deletes the artwork's own photos first — while the document still
  // exists and is in any status firestore.rules' `allow delete` permits
  // (seller artwork recovery/control pass: every status except SUBMITTED) —
  // then the Firestore document itself. Best-effort per image: an
  // already-missing Storage object (e.g. a save that failed partway) must
  // never block deleting the artwork it belongs to.
  const remove = useCallback(
    (id: string, images: readonly ArtworkImage[] = []) =>
      runMutation(async () => {
        await Promise.all(images.map((image) => deleteArtworkImageObject(image.path).catch(() => {})))
        await deleteOwnedArtwork(id)
      }),
    [runMutation],
  )
  // UI-03 final correction — the owner-facing "Remove from sale" action: a
  // non-destructive alternative to hard-deleting a PUBLISHED artwork (`remove`
  // above also works on PUBLISHED now, but this preserves the record while
  // taking it off the public marketplace, re-entering the moderation queue
  // instead — see removeArtworkFromSale's own comment).
  const removeFromSale = useCallback((id: string) => runMutation(() => removeArtworkFromSale(id)), [runMutation])

  return { update, submit, remove, removeFromSale, updateSafeFields, resubmitForReview, status, error }
}
