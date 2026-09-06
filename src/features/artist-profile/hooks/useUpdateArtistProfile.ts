import { useCallback, useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { updateArtistProfile } from '../api/artistProfileRepository'
import { isArtistProfileError, type ArtistProfileError, type UpdateArtistProfileInput } from '../types'

export type SaveStatus = 'idle' | 'saving' | 'success' | 'error'

export function useUpdateArtistProfile() {
  const { user } = useAuth()
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<ArtistProfileError | null>(null)

  const save = useCallback(
    async (input: UpdateArtistProfileInput): Promise<void> => {
      if (!user) {
        const unauthenticated: ArtistProfileError = {
          code: 'unauthenticated',
          message: 'You must be signed in to update your artist profile.',
        }
        setStatus('error')
        setError(unauthenticated)
        throw unauthenticated
      }

      setStatus('saving')
      setError(null)
      try {
        await updateArtistProfile(user.uid, input)
        setStatus('success')
      } catch (err) {
        setStatus('error')
        setError(isArtistProfileError(err) ? err : { code: 'unknown', message: 'Something went wrong. Please try again.' })
        throw err
      }
    },
    [user],
  )

  return { save, status, error }
}
