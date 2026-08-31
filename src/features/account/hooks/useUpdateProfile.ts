import { useCallback, useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { updateUserProfile } from '../api/profileRepository'
import { isAccountError, type AccountError, type UpdateUserProfileInput } from '../types'

export type SaveStatus = 'idle' | 'saving' | 'success' | 'error'

export function useUpdateProfile() {
  const { user } = useAuth()
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<AccountError | null>(null)

  const save = useCallback(
    async (input: UpdateUserProfileInput): Promise<void> => {
      if (!user) {
        setStatus('error')
        setError({ code: 'unauthenticated', message: 'You must be signed in to update your profile.' })
        return
      }

      setStatus('saving')
      setError(null)
      try {
        await updateUserProfile(user.uid, input)
        setStatus('success')
      } catch (err) {
        setStatus('error')
        setError(isAccountError(err) ? err : { code: 'unknown', message: 'Something went wrong. Please try again.' })
        throw err
      }
    },
    [user],
  )

  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
  }, [])

  return { save, status, error, reset }
}
