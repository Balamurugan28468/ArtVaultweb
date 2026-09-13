import { FirebaseError } from 'firebase/app'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'

/**
 * Module 13 Phase 3 — the sole client-side path to every privileged
 * moderation write. Every function here does exactly one thing: call the
 * matching Phase 1/2-hardened callable and translate a failure into a safe,
 * UI-facing message. No Firestore write of any kind happens in this file —
 * `sellers/{uid}.status`/`rejectionReason` and
 * `artworks/{artworkId}.status`/`rejectionReason` are only ever changed by
 * the trusted Admin SDK business logic behind these callables (see
 * functions/src/adminActions.ts); the browser has no other way to move
 * either field, by construction (firestore.rules denies it outright).
 */

export interface AdminActionError {
  message: string
}

/**
 * The server's own `HttpsError` messages are already safe to show verbatim
 * — Phase 2's `toCallableError` (functions/src/adminActions.ts) guarantees
 * every message reaching a real `functions/*`-coded client error has
 * already been vetted (a closed allowlist of known domain outcomes, or one
 * generic "internal" message; never a raw Firestore/gRPC detail). This
 * function's only real job is guarding the *other* case: a genuinely
 * unexpected client-side failure (offline, a malformed response, anything
 * that isn't a real callable error at all) gets one generic fallback
 * instead of whatever raw message it happens to carry.
 */
function toAdminActionError(error: unknown): AdminActionError {
  if (error instanceof FirebaseError && error.code.startsWith('functions/')) {
    return { message: error.message || 'This action could not be completed. Please try again.' }
  }
  console.error('adminApi: unexpected error invoking an admin callable', error)
  return { message: 'Something went wrong. Please try again.' }
}

export async function approveSellerApplication(uid: string): Promise<void> {
  try {
    await httpsCallable(functions, 'approveSellerApplication')({ uid })
  } catch (error) {
    throw toAdminActionError(error)
  }
}

export async function rejectSellerApplication(uid: string, rejectionReason: string): Promise<void> {
  try {
    await httpsCallable(functions, 'rejectSellerApplication')({ uid, rejectionReason })
  } catch (error) {
    throw toAdminActionError(error)
  }
}

export async function moderateArtwork(
  artworkId: string,
  decision: 'PUBLISHED' | 'REJECTED',
  rejectionReason?: string,
): Promise<void> {
  try {
    await httpsCallable(functions, 'moderateArtwork')({ artworkId, decision, rejectionReason })
  } catch (error) {
    throw toAdminActionError(error)
  }
}

export function isAdminActionError(value: unknown): value is AdminActionError {
  return typeof value === 'object' && value !== null && 'message' in value && typeof (value as { message: unknown }).message === 'string'
}
