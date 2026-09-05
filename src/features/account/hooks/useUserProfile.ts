import { useEffect, useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { subscribeUserProfile } from '../api/profileRepository'
import type { ProfileState } from '../types'

// A brand-new Firebase Auth account's users/{uid} document is created
// asynchronously by the onUserCreate Cloud Function trigger. The sign-up
// flow itself already waits for that document before ever navigating here
// (see authClient.ts's waitForUserProfileDocument), so this grace window
// only matters for edge cases outside that flow — e.g. a second tab opened
// moments after sign-up, before the first tab's wait resolved, or the
// trigger being unusually slow. Comfortably longer than that wait's own
// 15s safety-net timeout, so an account created well before this window is
// never mislabeled as "still setting up" — it gets the honest "missing"
// state instead (see AccountPage).
const PROVISIONING_GRACE_MS = 20_000

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

    const createdAtMs = user.metadata?.creationTime ? new Date(user.metadata.creationTime).getTime() : 0
    const isWithinGracePeriod = () => Date.now() - createdAtMs < PROVISIONING_GRACE_MS

    setState({ status: 'loading' })
    const unsubscribe = subscribeUserProfile(
      user.uid,
      (profile) => {
        if (profile) {
          setState({ status: 'loaded', profile })
        } else {
          setState({ status: isWithinGracePeriod() ? 'provisioning' : 'missing' })
        }
      },
      (error) => setState({ status: 'error', error }),
    )

    // The Firestore listener above is what actually detects the document
    // arriving — this timer never gates or retries that. Its only job is to
    // stop showing the optimistic "still setting up" label once the grace
    // window has genuinely closed, so a permanently orphaned account
    // doesn't display that message forever.
    let graceTimer: ReturnType<typeof setTimeout> | undefined
    if (isWithinGracePeriod()) {
      graceTimer = setTimeout(
        () => {
          setState((current) => (current.status === 'provisioning' ? { status: 'missing' } : current))
        },
        Math.max(0, createdAtMs + PROVISIONING_GRACE_MS - Date.now()),
      )
    }

    return () => {
      unsubscribe()
      if (graceTimer) clearTimeout(graceTimer)
    }
  }, [status, user])

  return state
}
