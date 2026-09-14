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
 * The server's own `HttpsError` messages are safe to show verbatim for
 * every outcome our own `toCallableError` (functions/src/adminActions.ts)
 * actually constructs — a closed allowlist of known domain outcomes, or its
 * own generic "This action could not be completed..." message. `internal`
 * is deliberately excluded from that trust: it is the one code the
 * `@firebase/functions` client SDK *also* fabricates on its own, client-
 * side, whenever the underlying `fetch()` to the callable never completed
 * at all (offline, a dropped connection, or — the real incident this
 * guards against — a 404 from the emulator/Cloud Functions router for a
 * route that doesn't exist, which arrives with no CORS header and is
 * therefore indistinguishable from a network failure to the browser). That
 * SDK-fabricated message reads as the literal, meaningless string
 * `"internal [0]"` — our own server code never produced it, and it must
 * never reach a real user verbatim. Every other `functions/*` code is only
 * ever set by our own explicit `HttpsError` throws, so it stays trusted.
 */
function toAdminActionError(error: unknown): AdminActionError {
  if (error instanceof FirebaseError && error.code.startsWith('functions/')) {
    const isUnvettedInternalError = error.code === 'functions/internal'
    return {
      message: !isUnvettedInternalError && error.message ? error.message : 'This action could not be completed. Please try again.',
    }
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

/**
 * Admin moderation override (UI-03 final correction) — the one path that
 * can take any artwork, regardless of owner or current status, off the
 * public marketplace. Calls straight through to the `suspendArtwork`
 * callable; no Firestore write happens in this file, same as every other
 * function here.
 */
export async function suspendArtwork(artworkId: string, reason: string): Promise<void> {
  try {
    await httpsCallable(functions, 'suspendArtwork')({ artworkId, reason })
  } catch (error) {
    throw toAdminActionError(error)
  }
}

export function isAdminActionError(value: unknown): value is AdminActionError {
  return typeof value === 'object' && value !== null && 'message' in value && typeof (value as { message: unknown }).message === 'string'
}
