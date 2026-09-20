import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '../types'

export interface EnsureUserProfileOptions {
  role?: UserRole
  displayName?: string | null
}

type IdentityLike = {
  id?: string
  uid?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export async function ensureUserProfile(
  user: IdentityLike,
  _options?: EnsureUserProfileOptions,
): Promise<void> {
  const userId = user.id ?? user.uid

  if (!userId) {
    throw new Error('Authenticated user ID is missing.')
  }

  const supabase = createClient()

  const retries = 10
  const delayMs = 150

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const queryResult = (await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle()) as {
      data: { id: string } | null
      error: { message: string } | null
    }

    const { data, error } = queryResult

    if (error) {
      throw error
    }

    if (data?.id === userId) {
      return
    }

    if (attempt < retries) {
      await sleep(delayMs)
    }
  }

  throw new Error(
    'Your Supabase account exists, but its profile was not provisioned.',
  )
}