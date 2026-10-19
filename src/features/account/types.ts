import type { UserProfile } from '@/features/auth/types'

/**
 * Fields that the signed-in user may edit from
 * the ArtVault account profile screen.
 *
 * Identity, email, role, timestamps and other
 * authorization-controlled fields are never
 * accepted from this form.
 */
export interface UpdateUserProfileInput {
  displayName: string
  phoneNumber: string | null
  bio: string | null
}

export type AccountErrorCode =
  | 'unauthenticated'
  | 'permission-denied'
  | 'network'
  | 'not-found'
  | 'unknown'

export interface AccountError {
  code: AccountErrorCode
  message: string
}

export function isAccountError(
  value: unknown,
): value is AccountError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value
  )
}

export type ProfileState =
  | {
      status: 'loading'
    }
  | {
      status: 'loaded'
      profile: UserProfile
    }
  | {
      status: 'provisioning'
    }
  | {
      status: 'missing'
    }
  | {
      status: 'error'
      error: AccountError
    }