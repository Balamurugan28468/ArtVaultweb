export const USER_ROLES = ['CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'] as const

export type UserRole = (typeof USER_ROLES)[number]

export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === 'string' &&
    (USER_ROLES as readonly string[]).includes(value)
  )
}

export interface AuthUser {
  id: string

  /**
   * Compatibility alias while the rest of ArtVault is migrated.
   * Supabase user.id === old Firebase user.uid.
   */
  uid: string

  email: string | null
  displayName: string | null
  photoURL: string | null
  phoneNumber: string | null
  emailVerified: boolean

  /**
   * ISO timestamp from Supabase auth.users.created_at.
   */
  createdAt: string | null
}

export interface UserProfile {
  id: string
  uid: string

  email: string | null
  displayName: string | null
  phoneNumber: string | null
  bio: string | null

  photoPath: string | null
  photoURL: string | null

  role: UserRole
  profileCompleted: boolean

  /**
   * Supabase/PostgreSQL timestamptz values are ISO strings.
   */
  createdAt: string
  updatedAt: string
}