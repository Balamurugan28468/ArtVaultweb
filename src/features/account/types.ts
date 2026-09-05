import type { UserProfile } from '@/features/auth/types'

/**
 * The only fields a customer may submit through Edit Profile. Everything
 * else on UserProfile (uid, email, role, createdAt, photoURL) is either
 * permanently read-only from the client or not yet editable in this module
 * — see firestore.rules for the server-enforced allow-list this mirrors.
 */
export interface UpdateUserProfileInput {
  displayName: string
  phoneNumber: string | null
  bio: string | null
}

export type AccountErrorCode = 'unauthenticated' | 'permission-denied' | 'network' | 'not-found' | 'unknown'

export interface AccountError {
  code: AccountErrorCode
  message: string
}

export function isAccountError(value: unknown): value is AccountError {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value
}

export type ProfileState =
  | { status: 'loading' }
  | { status: 'loaded'; profile: UserProfile }
  | { status: 'provisioning' }
  | { status: 'missing' }
  | { status: 'error'; error: AccountError }
