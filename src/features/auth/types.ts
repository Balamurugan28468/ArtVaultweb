import type { Timestamp } from 'firebase/firestore'

export const USER_ROLES = ['CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'] as const

export type UserRole = (typeof USER_ROLES)[number]

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value)
}

/**
 * Canonical shape of a users/{uid} Firestore document (see docs/DATABASE.md).
 * Created once by functions/src/index.ts's onUserCreate trigger; uid, email,
 * role, and createdAt are permanently read-only from the client — enforced by
 * firestore.rules, not just by convention.
 */
export interface UserProfile {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  role: UserRole
  phoneNumber: string | null
  bio: string | null
  profileCompleted: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}
