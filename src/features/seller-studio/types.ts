import type { Timestamp } from 'firebase/firestore'

export const SELLER_STATUSES = ['PENDING', 'APPROVED'] as const

export type SellerStatus = (typeof SELLER_STATUSES)[number]

export function isSellerStatus(value: unknown): value is SellerStatus {
  return typeof value === 'string' && (SELLER_STATUSES as readonly string[]).includes(value)
}

/**
 * Canonical shape of a sellers/{uid} Firestore document (see
 * docs/DATABASE.md). Created once by the client on application submission,
 * with `status` forced to 'PENDING' by firestore.rules regardless of what
 * the client sends; only ever moved to 'APPROVED' by the
 * functions/src/promoteSeller.ts operator script (Admin SDK) — never by any
 * client write. See docs/SECURITY.md for the full rationale.
 */
export interface SellerApplication {
  uid: string
  status: SellerStatus
  businessName: string
  description: string
  contactEmail: string
  appliedAt: Timestamp
  reviewedAt: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface SellerApplicationInput {
  businessName: string
  description: string
  contactEmail: string
}

export type SellerErrorCode = 'unauthenticated' | 'permission-denied' | 'network' | 'unknown'

export interface SellerError {
  code: SellerErrorCode
  message: string
}

export function isSellerError(value: unknown): value is SellerError {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value
}

export type SellerApplicationState =
  | { status: 'loading' }
  | { status: 'not-applied' }
  | { status: 'pending'; application: SellerApplication }
  | { status: 'approved'; application: SellerApplication }
  | { status: 'error'; error: SellerError }
