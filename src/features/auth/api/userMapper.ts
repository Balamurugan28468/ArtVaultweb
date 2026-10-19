import type { User as SupabaseUser } from '@supabase/supabase-js'
import type { AuthUser } from '../types'

function getMetadataString(
  metadata: Record<string, unknown> | undefined,
  ...keys: string[]
): string | null {
  if (!metadata) return null

  for (const key of keys) {
    const value = metadata[key]

    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

export function mapSupabaseUser(user: SupabaseUser): AuthUser {
  const metadata =
    user.user_metadata as Record<string, unknown> | undefined

  return {
    id: user.id,
    uid: user.id,

    email: user.email ?? null,

    displayName: getMetadataString(
      metadata,
      'display_name',
      'displayName',
      'full_name',
      'name',
    ),

    photoURL: getMetadataString(
      metadata,
      'avatar_url',
      'photo_url',
      'photoURL',
    ),

    phoneNumber: user.phone ?? null,

    emailVerified: Boolean(user.email_confirmed_at),

    createdAt: user.created_at ?? null,
  }
}