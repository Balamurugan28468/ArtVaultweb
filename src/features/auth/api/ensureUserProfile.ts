import type { User } from 'firebase/auth'
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { UserRole } from '../types'

export interface EnsureUserProfileOptions {
  /**
   * The role to write if the profile has to be created. Must be the
   * caller's own best-known trusted role — usually whatever
   * `waitForRoleClaim`/`getCurrentRoleClaim` returned, defaulting to
   * `'CUSTOMER'` when no claim exists yet. This value is never trusted by
   * itself: firestore.rules independently re-derives the same value from
   * the authenticated ID token's own `role` claim (or `'CUSTOMER'` if that
   * claim is absent) and rejects the write outright if it doesn't match —
   * a client can request nothing here it couldn't already prove it's
   * entitled to via its own (unforgeable) token.
   */
  role: UserRole
  displayName?: string | null
}

class ApprovedSellerRolePendingError extends Error {
  constructor() {
    super('Approved seller role reconciliation has not completed')
    this.name = 'ApprovedSellerRolePendingError'
  }
}

/**
 * Idempotent, secure, client-triggered canonical profile provisioning.
 *
 * users/{uid} has historically been created only by the onUserCreate Cloud
 * Function trigger (Admin SDK) — an asynchronous, out-of-band write. On
 * this project's local dev machine, the Functions emulator has repeatedly
 * failed to load that trigger under heavy sustained load, producing real
 * Firebase Auth users with no matching Firestore profile ("No profile
 * found"), sometimes permanently, since a one-shot Auth trigger never fires
 * again for an account that already exists. Depending on a single Cloud
 * Function for a core account guarantee is no longer acceptable — this
 * makes the *client* able to safely guarantee its own profile exists,
 * whenever an authenticated session becomes available (see
 * AuthProvider.tsx and authClient.ts), so `onUserCreate` becomes optional
 * defense-in-depth/reconciliation rather than a single point of failure
 * (see the mirrored idempotency guard added to
 * functions/src/index.ts's handleUserCreate).
 *
 * Safety, by construction rather than convention:
 * - Firestore evaluates a write as `create` only when no document
 *   currently exists at this path, and as `update` otherwise, regardless
 *   of which client SDK method was used. This function can therefore never
 *   overwrite an already-provisioned profile — a document that already
 *   exists is untouched here (checked inside the transaction, atomically
 *   with the possible write, so a concurrent create loses this race
 *   cleanly rather than being clobbered or duplicated).
 * - `firestore.rules`'s create rule independently re-derives the exact
 *   trusted role from the caller's own authenticated token and rejects any
 *   mismatch — this function's `role` parameter is advisory to the
 *   *client*, never authoritative to the *server*.
 */
export async function ensureUserProfile(user: User, { role, displayName }: EnsureUserProfileOptions): Promise<void> {
  const ref = doc(db, 'users', user.uid)

  try {
    await runTransaction(db, async (tx) => {
      const snapshot = await tx.get(ref)
      if (snapshot.exists()) return

      if (role === 'CUSTOMER') {
        const sellerSnapshot = await getDoc(doc(db, 'sellers', user.uid))
        if (sellerSnapshot?.exists() && sellerSnapshot.data()?.status === 'APPROVED') {
          throw new ApprovedSellerRolePendingError()
        }
      }

      tx.set(ref, {
        uid: user.uid,
        email: user.email,
        displayName: displayName ?? user.displayName ?? null,
        photoURL: null,
        role,
        phoneNumber: null,
        bio: null,
        profileCompleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    })
  } catch (error) {
    if (error instanceof ApprovedSellerRolePendingError) throw error

    // A benign race: something else (the onUserCreate trigger, another
    // browser tab) created the document between our check and this write —
    // Firestore rejects our create-shaped payload as an invalid *update* in
    // that case (see isValidProfileUpdate in firestore.rules), which
    // surfaces here as a normal error, not a special signal. Confirm the
    // document actually exists now before treating this as a genuine
    // failure that should propagate.
    const recheck = await getDoc(ref)
    if (recheck.exists()) return
    throw error
  }
}
