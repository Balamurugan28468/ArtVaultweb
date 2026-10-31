import { createClient } from '@/lib/supabase/client'
import { isUserRole, type AuthUser, type UserRole } from '../types'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/**
 * Supabase replacement for the old Firebase role custom-claim reader.
 *
 * The function name is retained temporarily so existing ArtVault imports do
 * not all need to change at once.
 *
 * Authorization remains server-controlled through:
 *
 * private.user_roles
 * public.current_app_role()
 * RLS
 * protected RPCs
 */
export async function getCurrentRoleClaim(
  _user?: AuthUser | null,
  _forceRefresh = false,
): Promise<UserRole | null> {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('current_app_role')

  if (error) {
    throw error
  }

  if (isUserRole(data)) {
    return data
  }

  if (typeof data === 'string') {
    const normalized = data.toUpperCase()

    if (isUserRole(normalized)) {
      return normalized
    }
  }

  return null
}

/**
 * Usually the role exists immediately because provisioning is handled by
 * PostgreSQL during account creation.
 *
 * A small retry window is still useful immediately after registration and
 * during development.
 */
export async function waitForRoleClaim(
  user?: AuthUser | null,
  {
    retries = 10,
    delayMs = 200,
  }: {
    retries?: number
    delayMs?: number
    forceInitialRefresh?: boolean
  } = {},
): Promise<UserRole | null> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const role = await getCurrentRoleClaim(user)

      if (role) {
        return role
      }
    } catch (error) {
      lastError = error
    }

    if (attempt < retries) {
      await sleep(delayMs)
    }
  }

  if (lastError) {
    throw lastError
  }

  return null
}