import type { Timestamp } from 'firebase/firestore'

export const SELLER_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const

export type SellerStatus = (typeof SELLER_STATUSES)[number]

export function isSellerStatus(value: unknown): value is SellerStatus {
  return typeof value === 'string' && (SELLER_STATUSES as readonly string[]).includes(value)
}

/**
 * Canonical shape of a sellers/{uid} Firestore document (see
 * docs/DATABASE.md). Created once by the client on application submission,
 * with `status` forced to 'PENDING' by firestore.rules regardless of what
 * the client sends; only ever moved to 'APPROVED' or 'REJECTED' by the
 * functions/src/promoteSeller.ts operator script / the Module 13 admin
 * callables (Admin SDK either way) — never by any client write.
 * `rejectionReason` is set only alongside a REJECTED decision, always
 * `null` otherwise; `firestore.rules`' `allow update: if false` means a
 * REJECTED application stays exactly as-is — there is deliberately no
 * client-facing reapplication/resubmission path yet (see
 * docs/SECURITY.md and the Module 13 project-state write-up for why).
 */
export interface SellerApplication {
  uid: string
  status: SellerStatus
  businessName: string
  description: string
  contactEmail: string
  appliedAt: Timestamp
  reviewedAt: Timestamp | null
  rejectionReason: string | null
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
  | { status: 'rejected'; application: SellerApplication }
  | { status: 'error'; error: SellerError }
