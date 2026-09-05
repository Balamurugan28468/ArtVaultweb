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

      void (async () => {
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
        setRole(claimRole)
        setStatus('authenticated')
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
