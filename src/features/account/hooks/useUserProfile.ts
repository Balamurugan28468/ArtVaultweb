import { useEffect, useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { subscribeUserProfile } from '../api/profileRepository'
import type { ProfileState } from '../types'

// AuthProvider now guarantees users/{uid} exists (creating it itself via
// ensureUserProfile if the onUserCreate Cloud Function hasn't, or never
// will) before it ever exposes `status: 'authenticated'` — for sign-up,
// normal sign-in, and persisted-session restoration alike. That guarantee
// is what makes "missing" genuinely exceptional now, rather than a normal
// transient state to wait out. This grace window is a much smaller,
// purely defensive buffer for residual client-side cache/listener jitter
// (e.g. Firestore's offline cache briefly reporting "not found" for a
// document that already exists server-side) — not a substitute for that
// guarantee, and not something this hook waits on by polling or retrying;
// the realtime listener below is what actually detects the document.
const PROVISIONING_GRACE_MS = 8_000

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
