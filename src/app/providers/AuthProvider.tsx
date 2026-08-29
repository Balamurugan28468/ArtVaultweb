import { onAuthStateChanged, type User } from 'firebase/auth'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
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
    // Guards against two edge cases: (1) auth state changing again before an
    // in-flight role-claim lookup resolves, which could otherwise let a
    // stale response overwrite newer state, and (2) that lookup resolving
    // after this component has unmounted.
    let currentToken = 0

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      currentToken += 1
      const token = currentToken
      setUser(nextUser)

      if (!nextUser) {
        setRole(null)
        setStatus('unauthenticated')
        return
      }

      // Uses the same retry/forced-refresh logic as sign-up: a cached
      // session (e.g. restored on page refresh) can predate the
      // onUserCreate trigger actually setting the claim, and a single
      // unforced read would otherwise get stuck showing no role forever.
      void waitForRoleClaim(nextUser).then((claimRole) => {
        if (token !== currentToken) return
        setRole(claimRole)
        setStatus('authenticated')
      })
    })

    return () => {
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
