import { useCallback, useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { applyAsSeller } from '../api/sellerRepository'
import { isSellerError, type SellerApplicationInput, type SellerError } from '../types'

export type ApplyStatus = 'idle' | 'saving' | 'success' | 'error'

export function useApplyAsSeller() {
  const { user } = useAuth()
  const [status, setStatus] = useState<ApplyStatus>('idle')
  const [error, setError] = useState<SellerError | null>(null)

  const apply = useCallback(
    async (input: SellerApplicationInput): Promise<void> => {
      if (!user) {
        setStatus('error')
        setError({ code: 'unauthenticated', message: 'You must be signed in to apply.' })
        return
      }

      setStatus('saving')
      setError(null)
      try {
        await applyAsSeller(user.uid, input)
        setStatus('success')
      } catch (err) {
        setStatus('error')
        setError(isSellerError(err) ? err : { code: 'unknown', message: 'Something went wrong. Please try again.' })
        throw err
      }
    },
    [user],
  )

  return { apply, status, error }
}
