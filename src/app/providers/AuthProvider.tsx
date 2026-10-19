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

    const resolveSession = async (
      session: Session | null,
    ) => {
      sessionVersion += 1

      const currentVersion = sessionVersion

      if (!session?.user) {
        if (!active) return

        setUser(null)
        setRole(null)
        setStatus('unauthenticated')

        return
      }

      const mappedUser =
        mapSupabaseUser(session.user)

      if (!active) return

      setUser(mappedUser)

      // Keep an existing authenticated screen usable during token refreshes.
      setStatus((current) =>
        current === 'authenticated'
          ? 'authenticated'
          : 'loading',
      )

      try {
        /**
         * Supabase provisions public.profiles through the database trigger.
         * This only verifies that provisioning completed.
         */
        await ensureUserProfile(mappedUser)
      } catch (error) {
        /**
         * Authentication itself is still valid even if profile loading
         * temporarily fails.
         *
         * Do not destroy a valid Supabase session because of a profile query.
         */
        console.error(
          'Failed to verify Supabase user profile:',
          error,
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
      } catch (error) {
        console.error(
          'Failed to resolve Supabase application role:',
          error,
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
        /**
         * Keep the auth callback itself synchronous.
         * Perform database/RPC work immediately afterward.
         */
        window.setTimeout(() => {
          void resolveSession(session)
        }, 0)
      },
    )

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return

        if (error) {
          console.error(
            'Failed to restore Supabase session:',
            error,
          )

          setUser(null)
          setRole(null)
          setStatus('unauthenticated')

          return
        }

        void resolveSession(data.session)
      })
      .catch((error) => {
        console.error(
          'Unexpected Supabase session restoration error:',
          error,
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
    } catch (error) {
      console.error(
        'Failed to refresh Supabase role:',
        error,
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

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error(
      'useAuth must be used within an AuthProvider',
    )
  }

  return context
}