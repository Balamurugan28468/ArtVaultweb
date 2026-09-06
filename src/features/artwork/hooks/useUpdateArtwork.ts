import { useCallback, useState } from 'react'
import { deleteArtworkImageObject } from '../api/artworkImageStorage'
import { deleteArtworkDraft, submitArtwork, updateArtworkDraft } from '../api/artworkRepository'
import { isArtworkError, type ArtworkDraftInput, type ArtworkError, type ArtworkImage } from '../types'

export type UpdateStatus = 'idle' | 'saving' | 'success' | 'error'

/** Owns update/submit/delete — the three mutations available on an existing artwork — sharing one status/error so any one of them disables the others while in flight. */
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
  // Deletes the draft's own photos first — while the artwork doc still
  // exists and is still DRAFT, the only state storage.rules ever allows a
  // delete in — then the Firestore document itself. Best-effort per image:
  // an already-missing Storage object (e.g. a save that failed partway)
  // must never block discarding the draft it belongs to.
  const remove = useCallback(
    (id: string, images: readonly ArtworkImage[] = []) =>
      runMutation(async () => {
        await Promise.all(images.map((image) => deleteArtworkImageObject(image.path).catch(() => {})))
        await deleteArtworkDraft(id)
      }),
    [runMutation],
  )

  return { update, submit, remove, status, error }
}
