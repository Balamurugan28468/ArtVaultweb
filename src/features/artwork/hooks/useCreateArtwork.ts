import { useCallback, useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { createArtworkDraft } from '../api/artworkRepository'
import { isArtworkError, type ArtworkDraftInput, type ArtworkError } from '../types'

export type CreateStatus = 'idle' | 'saving' | 'success' | 'error'

export function useCreateArtwork() {
  const { user } = useAuth()
  const [status, setStatus] = useState<CreateStatus>('idle')
  const [error, setError] = useState<ArtworkError | null>(null)

  const create = useCallback(
    async (input: ArtworkDraftInput): Promise<string> => {
      if (!user) {
        const unauthenticated: ArtworkError = { code: 'unauthenticated', message: 'You must be signed in to create an artwork.' }
        setStatus('error')
        setError(unauthenticated)
        throw unauthenticated
      }

      setStatus('saving')
      setError(null)
      try {
        const id = await createArtworkDraft(user.uid, input)
        setStatus('success')
        return id
      } catch (err) {
        setStatus('error')
        setError(isArtworkError(err) ? err : { code: 'unknown', message: 'Something went wrong. Please try again.' })
        throw err
      }
    },
    [user],
  )

  return { create, status, error }
}
