import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { ensureUserProfile } from '@/features/auth/api/ensureUserProfile'
import { getAccountStatus } from '@/features/auth/api/accountAccess'
import {
  getCurrentRoleClaim,
  waitForRoleClaim,
} from '@/features/auth/api/roleClaim'
import { mapSupabaseUser } from '@/features/auth/api/userMapper'
import type {
  AuthUser,
  UserRole,
} from '@/features/auth/types'

type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'

interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  role: UserRole | null
  refreshRole: () => Promise<void>
}

const AuthContext =
  createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({
  children,
}: {
  children: ReactNode
}) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [status, setStatus] =
    useState<AuthStatus>('loading')

  useEffect(() => {
    const supabase = createClient()

    let active = true
    let sessionVersion = 0
    let authEventVersion = 0
    let resolvedIdentity: string | null = null

    const resolveSession = async (
      session: Session | null,
    ) => {
      sessionVersion += 1

      const currentVersion = sessionVersion

      if (!session?.user || !session.user.email_confirmed_at) {
        if (!active) return

        resolvedIdentity = null
        setUser(null)
        setRole(null)
        setStatus('unauthenticated')

        return
      }

      const mappedUser =
        mapSupabaseUser(session.user)

      if (!active) return

      // Never expose the previous user's UI identity or role while resolving
      // a newly signed-in user's account status and permissions.
      if (resolvedIdentity !== mappedUser.id) {
        setUser(null)
        setRole(null)
        setStatus('loading')
      }

      try {
        const accountStatus = await getAccountStatus(mappedUser.id)
        if (!active || currentVersion !== sessionVersion) return
        if (accountStatus !== 'ACTIVE') {
          resolvedIdentity = null
          setUser(null)
          setRole(null)
          setStatus('unauthenticated')
          await supabase.auth.signOut({ scope: 'local' })
          return
        }
      } catch {
        if (!active || currentVersion !== sessionVersion) return
        resolvedIdentity = null
        setUser(null)
        setRole(null)
        setStatus('unauthenticated')
        return
      }

      // The authenticated identity is committed only after the account and
      // role checks complete; token refresh for the same identity keeps the
      // existing authenticated UI usable.

      try {
        /**
         * Supabase provisions public.profiles through the database trigger.
         * This only verifies that provisioning completed.
         */
        await ensureUserProfile(mappedUser)
      } catch {
        /**
         * Authentication itself is still valid even if profile loading
         * temporarily fails.
         *
         * Do not destroy a valid Supabase session because of a profile query.
         */
        console.error(
          'Failed to verify Supabase user profile:',
        )
      }

      if (
        !active ||
        currentVersion !== sessionVersion
      ) {
        return
      }

      let resolvedRole: UserRole | null = null

      try {
        resolvedRole =
          await waitForRoleClaim(mappedUser)
      } catch {
        console.error(
          'Failed to resolve Supabase application role:',
        )
      }

      if (
        !active ||
        currentVersion !== sessionVersion
      ) {
        return
      }

      /**
       * CUSTOMER is the safest UI fallback.
       *
       * This does NOT grant database privileges.
       *
       * PostgreSQL RLS and protected RPCs remain authoritative.
       */
      resolvedIdentity = mappedUser.id
      setUser(mappedUser)
      setRole(resolvedRole ?? 'CUSTOMER')
      setStatus('authenticated')
    }

    /**
     * Subscribe first so auth changes cannot be missed while getSession()
     * is resolving.
     */
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        authEventVersion += 1
        /**
         * Keep the auth callback itself synchronous.
         * Perform database/RPC work immediately afterward.
         */
        window.setTimeout(() => {
          void resolveSession(session)
        }, 0)
      },
    )

    const initialAuthEventVersion = authEventVersion
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        // A newer auth event (including SIGNED_OUT) supersedes any
        // potentially stale session returned by this initial snapshot.
        if (!active || authEventVersion !== initialAuthEventVersion) return

        if (error) {
          console.error(
            'Failed to restore Supabase session:',
          )

          setUser(null)
          setRole(null)
          setStatus('unauthenticated')

          return
        }

        void resolveSession(data.session)
      })
      .catch(() => {
        if (!active || authEventVersion !== initialAuthEventVersion) return
        console.error(
          'Unexpected Supabase session restoration error:',
        )

        if (!active) return

        setUser(null)
        setRole(null)
        setStatus('unauthenticated')
      })

    return () => {
      active = false
      sessionVersion += 1
      subscription.unsubscribe()
    }
  }, [])

  const refreshRole = async () => {
    if (!user) return

    try {
      const nextRole =
        await getCurrentRoleClaim(user)

      setRole(nextRole ?? 'CUSTOMER')
    } catch {
      console.error(
        'Failed to refresh Supabase role:',
      )
    }
  }

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        role,
        refreshRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext) ?? null
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error(
      'useAuth must be used within an AuthProvider',
    )
  }

  return context
}
