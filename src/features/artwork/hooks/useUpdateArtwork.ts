import { useCallback, useState } from 'react'
import { deleteArtworkDraft, submitArtwork, updateArtworkDraft } from '../api/artworkRepository'
import { isArtworkError, type ArtworkDraftInput, type ArtworkError } from '../types'

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
  const remove = useCallback((id: string) => runMutation(() => deleteArtworkDraft(id)), [runMutation])

  return { update, submit, remove, status, error }
}
