import { createClient } from '@/lib/supabase/client'
import { dataError, observe, requireIdentity, result } from '@/lib/supabase/data'
import { Timestamp, timestamp } from '@/lib/supabase/timestamp'
import { isSellerStatus, type SellerApplication, type SellerApplicationInput, type SellerError } from '../types'

export const toSellerError = dataError

/**
 * Defensive mapping — never assumes every field is present or well-typed.
 * Exported for reuse by other read paths over the same collection (see
 * features/admin/api/adminQueueRepository.ts, Module 13) — the mapping
 * itself doesn't change across query shapes, only which documents a given
 * query/rule can ever return.
 */
export function mapToSellerApplication(uid: string, data: Record<string, unknown>): SellerApplication | null {
  if (!isSellerStatus(data.status)) return null

  return {
    uid,
    status: data.status,
    businessName: typeof data.business_name === 'string' ? data.business_name : '',
    description: typeof data.description === 'string' ? data.description : '',
    contactEmail: typeof data.contact_email === 'string' ? data.contact_email : '',
    appliedAt: typeof data.created_at === 'string' ? timestamp(data.created_at) : Timestamp.now(),
    reviewedAt: typeof data.reviewed_at === 'string' ? timestamp(data.reviewed_at) : null,
    rejectionReason: typeof data.rejection_reason === 'string' ? data.rejection_reason : null,
    createdAt: typeof data.created_at === 'string' ? timestamp(data.created_at) : Timestamp.now(),
    updatedAt: typeof data.updated_at === 'string' ? timestamp(data.updated_at) : Timestamp.now(),
  }
}

/** Exactly one Firestore listener per call — callers own cleanup via the returned Unsubscribe. */
export function subscribeSellerApplication(
  uid: string,
  onData: (application: SellerApplication | null) => void,
  onError: (error: SellerError) => void,
): () => void {
  return observe('seller_profiles', `id=eq.${uid}`, async () => {
    const row = await result(createClient().from('seller_profiles').select('*').eq('id', uid).maybeSingle())
    return row ? mapToSellerApplication(uid, row) : null
  }, onData, onError)
}

/**
 * Submits a seller application. Uses `setDoc` (not `updateDoc`) deliberately:
 * Firestore rules distinguish `create` (no prior document at this path) from
 * `update` (one already exists) based on prior document existence alone,
 * regardless of which client method is called. `firestore.rules` allows
 * `create` here (forcing status to 'PENDING' no matter what the client
 * sends) but denies `update` entirely — so a second `applyAsSeller` call
 * against an existing application (PENDING or APPROVED) is rejected by the
 * server as a duplicate/unauthorized-modification attempt, not just
 * discouraged by the UI. See docs/SECURITY.md.
 */
export async function applyAsSeller(uid: string, input: SellerApplicationInput): Promise<void> {
  try {
    await requireIdentity(uid)
    await result(createClient().from('seller_profiles').insert({
      id: uid,
      business_name: input.businessName.trim(),
      description: input.description.trim(),
      contact_email: input.contactEmail.trim(),
    }))
  } catch (error) {
    throw toSellerError(error)
  }
}
