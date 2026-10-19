import { rpc } from '@/lib/supabase/data'
import type { UserRole } from '@/features/auth/types'
import type { AdminActionError } from '../types'

export type { AdminActionError }

export const approveSellerApplication = (uid: string) =>
  rpc('review_seller', { target: uid, decision: 'APPROVED' })

export const rejectSellerApplication = (uid: string, rejectionReason: string) =>
  rpc('review_seller', { target: uid, decision: 'REJECTED', reason: rejectionReason })

export const suspendSellerApplication = (uid: string, reason: string) =>
  rpc('review_seller', { target: uid, decision: 'SUSPENDED', reason })

export const suspendSeller = suspendSellerApplication

export const moderateArtwork = (
  artworkId: string,
  decision: 'PUBLISHED' | 'REJECTED',
  rejectionReason?: string,
) =>
  rpc('moderate_artwork', {
    target: artworkId,
    decision,
    reason: rejectionReason ?? null,
  })

export const suspendArtwork = (artworkId: string, reason: string) =>
  rpc('moderate_artwork', { target: artworkId, decision: 'SUSPENDED', reason })

export const restoreArtwork = (artworkId: string) =>
  rpc('moderate_artwork', { target: artworkId, decision: 'RESTORE' })

export const moderateUser = (
  uid: string,
  decision: 'ACTIVE' | 'SUSPENDED',
  reason?: string,
) =>
  rpc('moderate_user', {
    target: uid,
    decision,
    reason: reason ?? null,
  })

export const setUserRole = (uid: string, role: UserRole) =>
  rpc('set_user_role', { target: uid, new_role: role })

export function isAdminActionError(value: unknown): value is AdminActionError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as { message: unknown }).message === 'string'
  )
}
