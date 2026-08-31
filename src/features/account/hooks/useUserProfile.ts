import { useEffect, useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { subscribeUserProfile } from '../api/profileRepository'
import type { ProfileState } from '../types'

/**
 * Owns exactly one realtime Firestore subscription for the signed-in user's
 * profile, re-subscribing only when the uid actually changes and always
 * cleaning up the previous listener first — never more than one listener
 * live for a given uid at a time.
 */
export function useUserProfile(): ProfileState {
  const { status, user } = useAuth()
  const [state, setState] = useState<ProfileState>({ status: 'loading' })

  useEffect(() => {
    if (status !== 'authenticated' || !user) {
      setState({ status: 'loading' })
      return
    }

    setState({ status: 'loading' })
    const unsubscribe = subscribeUserProfile(
      user.uid,
      (profile) => setState(profile ? { status: 'loaded', profile } : { status: 'missing' }),
      (error) => setState({ status: 'error', error }),
    )

    return unsubscribe
  }, [status, user])

  return state
}
