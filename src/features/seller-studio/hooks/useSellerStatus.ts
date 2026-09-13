import { useEffect, useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { subscribeSellerApplication } from '../api/sellerRepository'
import type { SellerApplicationState } from '../types'

/**
 * Owns exactly one realtime Firestore subscription for the signed-in user's
 * seller application, re-subscribing only when the uid actually changes —
 * mirrors account/hooks/useUserProfile.ts's exact pattern.
 */
export function useSellerStatus(): SellerApplicationState {
  const { status, user } = useAuth()
  const [state, setState] = useState<SellerApplicationState>({ status: 'loading' })

  useEffect(() => {
    if (status !== 'authenticated' || !user) {
      setState({ status: 'loading' })
      return
    }

    setState({ status: 'loading' })
    const unsubscribe = subscribeSellerApplication(
      user.uid,
      (application) => {
        if (!application) {
          setState({ status: 'not-applied' })
        } else if (application.status === 'APPROVED') {
          setState({ status: 'approved', application })
        } else if (application.status === 'REJECTED') {
          setState({ status: 'rejected', application })
        } else {
          setState({ status: 'pending', application })
        }
      },
      (error) => setState({ status: 'error', error }),
    )

    return unsubscribe
  }, [status, user])

  return state
}
