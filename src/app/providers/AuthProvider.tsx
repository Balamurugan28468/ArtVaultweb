import { onAuthStateChanged, type User } from 'firebase/auth'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { ensureUserProfile } from '@/features/auth/api/ensureUserProfile'
import { getCurrentRoleClaim, waitForRoleClaim } from '@/features/auth/api/roleClaim'
import type { UserRole } from '@/features/auth/types'
import { auth } from '@/lib/firebase/config'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  status: AuthStatus
  user: User | null
  role: UserRole | null
  refreshRole: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    // Guards against three edge cases: (1) a callback from a listener this
    // exact effect instance already tore down still firing — React
    // StrictMode's dev-only mount→cleanup→mount double-invoke can leave one
    // of Firebase's own queued "initial state" callbacks in flight after
    // `unsubscribe()` was already called on it, and that queued callback can
    // report a stale `null` before the real persisted session resolves on
    // the listener that replaced it; (2) auth state changing again before an
    // in-flight role-claim lookup resolves, which could otherwise let a
    // stale response overwrite newer state; and (3) any lookup resolving
    // after this component has unmounted for good.
    let active = true
    let currentToken = 0

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (!active) return
      currentToken += 1
      const token = currentToken
      setUser(nextUser)

      if (!nextUser) {
        setRole(null)
        setStatus('unauthenticated')
        return
      }

      // Real incident this guards against: `status` staying 'loading'
      // forever, with no visible auth control and no console error, for a
      // browser holding a persisted Firebase session that can no longer be
      // refreshed (e.g. the Auth emulator was restarted/wiped since the
      // session was created, so the cached user's refresh token no longer
      // corresponds to anything the emulator recognizes). `waitForRoleClaim`
      // calls `getIdTokenResult(user, true)`, which requires a real network
      // round-trip to mint a fresh token — previously, if that rejected for
      // *any* reason, this whole IIFE threw with nothing to catch it, so
      // the `setStatus('authenticated')` a few lines below never ran and
      // the UI hung in 'loading' indefinitely. A session that genuinely
      // cannot be refreshed cannot honestly be shown as authenticated
      // either, so this now degrades to 'unauthenticated' — reachable,
      // truthful, and exactly what lets the owner sign in again — rather
      // than granting a phantom authenticated session or hanging forever.
      let resolved = false
      const watchdog = setTimeout(() => {
        if (!resolved && active && token === currentToken) {
          console.error(
            'AuthProvider: still "loading" 10s after a user was detected — the role-claim/profile lookup has neither ' +
              'resolved nor thrown. This should be unreachable after the surrounding try/catch fix; if you see this, ' +
              'the actual stuck call is somewhere else in the chain (getIdTokenResult / ensureUserProfile) and needs its own diagnostic.',
          )
        }
      }, 10000)

      void (async () => {
        try {
          // A cached session (e.g. restored on page refresh) or a normal
          // sign-in can both predate onUserCreate actually finishing — waiting
          // here with retries/forced refreshes, rather than a single unforced
          // read, means a role claim that exists but hasn't propagated yet
          // still gets picked up instead of getting stuck showing none forever.
          const claimRole = await waitForRoleClaim(nextUser, { forceInitialRefresh: true })
          if (!active || token !== currentToken) return

          try {
            // Guarantees users/{uid} exists before this session is ever
            // exposed as "authenticated" — the one place this runs for both
            // normal sign-in and persisted-session restoration, so no screen
            // downstream can ever see an authenticated user with a genuinely
            // un-attempted missing profile. Uses the just-resolved claim (not
            // a guess) so a real SELLER/ADMIN/SUPER_ADMIN role is preserved if
            // this account's profile needs to be recovered; defaults to
            // CUSTOMER only when no claim exists at all.
            await ensureUserProfile(nextUser, { role: claimRole ?? 'CUSTOMER' })
          } catch (error) {
            // A genuine, non-race provisioning failure (e.g. Firestore
            // unreachable) — never swallowed silently. useUserProfile's own
            // realtime subscription independently observes the true
            // resulting state (missing/error) and reports it to the UI; this
            // log exists so the underlying cause is never lost. The already-
            // resolved role claim is still valid and correct regardless of
            // whether the Firestore write succeeded, so it's still used below.
            console.error('Failed to ensure user profile:', error)
          }

          if (!active || token !== currentToken) return
          resolved = true
          setRole(claimRole)
          setStatus('authenticated')
        } catch (error) {
          console.error('Failed to resolve the signed-in session (token refresh/role claim failed):', error)
          if (!active || token !== currentToken) return
          resolved = true
          setUser(null)
          setRole(null)
          setStatus('unauthenticated')
        } finally {
          clearTimeout(watchdog)
        }
      })()
    })

    return () => {
      active = false
      currentToken += 1
      unsubscribe()
    }
  }, [])

  const refreshRole = async () => {
    if (!auth.currentUser) return
    const claimRole = await getCurrentRoleClaim(auth.currentUser, true)
    setRole(claimRole)
  }

  return (
    <AuthContext.Provider value={{ status, user, role, refreshRole }}>{children}</AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
