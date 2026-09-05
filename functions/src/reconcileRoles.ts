/**
 * One-off operator script — NOT a deployed function, NOT reachable by any
 * client or callable endpoint. Trusted reconciliation for a real, proven
 * failure mode: local emulator data loss (or any other cause) can leave
 * Firebase Auth's SELLER custom claim, and/or the users/{uid}.role mirror,
 * out of sync with an already-APPROVED sellers/{uid} record — the one
 * canonical, trusted, rules-enforced-immutable-once-set record of who is
 * actually approved (rules deny every client update/delete on it; the only
 * way it ever becomes APPROVED is promoteSeller.ts, this script's sibling).
 * Restores SELLER from that one trusted Firestore source using Admin SDK
 * credentials; there is no "arbitrary client data" input anywhere in this
 * script, and no code path in it can ever produce a value other than the
 * literal string 'SELLER' — ADMIN/SUPER_ADMIN can never be inferred or
 * granted by it, accidentally or otherwise.
 *
 * Idempotent: running it against an already-consistent account is a safe
 * no-op (checked, not just re-written). Never demotes: an account whose
 * seller application isn't APPROVED is left completely untouched — this is
 * a narrow repair for one proven drift direction (restore what was already
 * approved), not a general-purpose role editor, and it never resets an
 * account to CUSTOMER under any circumstance.
 *
 * Local (emulator) usage:
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     npm run reconcile-roles -- <uid>
 *   (omit <uid> to scan every APPROVED seller application and reconcile all of them)
 *
 * Production usage (run only by the project owner, never committed):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npm run reconcile-roles
 */
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

export interface ReconcileResult {
  uid: string
  action:
    | 'already-consistent'
    | 'restored-seller-claim'
    | 'restored-role-mirror'
    | 'restored-profile-and-claim'
    | 'restored-both'
}

async function reconcileOne(uid: string): Promise<ReconcileResult> {
  const db = getFirestore()
  const sellerSnap = await db.collection('sellers').doc(uid).get()

  // Not an approved seller — nothing to reconcile, and nothing to demote.
  // Reconciliation only ever restores a proven APPROVED state; it is not a
  // path to APPROVED for anyone who isn't already there.
  if (!sellerSnap.exists || sellerSnap.data()?.status !== 'APPROVED') {
    return { uid, action: 'already-consistent' }
  }

  let userRecord
  try {
    userRecord = await getAuth().getUser(uid)
  } catch (error) {
    if ((error as { code?: string }).code === 'auth/user-not-found') {
      throw new Error(`Snapshot consistency failure: approved seller ${uid} has no Auth user`)
    }
    throw error
  }
  const currentClaimRole = (userRecord.customClaims as { role?: string } | undefined)?.role
  const userDocSnap = await db.collection('users').doc(uid).get()
  const currentMirrorRole = userDocSnap.data()?.role

  const claimNeedsFix = currentClaimRole !== 'SELLER'
  const profileNeedsFix = !userDocSnap.exists
  const mirrorNeedsFix = userDocSnap.exists && currentMirrorRole !== 'SELLER'

  if (!claimNeedsFix && !mirrorNeedsFix) {
    return { uid, action: 'already-consistent' }
  }

  if (claimNeedsFix) {
    await getAuth().setCustomUserClaims(uid, { role: 'SELLER' })
  }
  if (profileNeedsFix) {
    await db.collection('users').doc(uid).set({
      uid,
      email: userRecord.email ?? null,
      displayName: userRecord.displayName ?? null,
      photoURL: userRecord.photoURL ?? null,
      role: 'SELLER',
      phoneNumber: userRecord.phoneNumber ?? null,
      bio: null,
      profileCompleted: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  } else if (mirrorNeedsFix) {
    await db.collection('users').doc(uid).update({ role: 'SELLER', updatedAt: FieldValue.serverTimestamp() })
  }

  if (profileNeedsFix) return { uid, action: 'restored-profile-and-claim' }
  if (claimNeedsFix && mirrorNeedsFix) return { uid, action: 'restored-both' }
  if (claimNeedsFix) return { uid, action: 'restored-seller-claim' }
  return { uid, action: 'restored-role-mirror' }
}

export async function reconcileRoles(uid?: string): Promise<ReconcileResult[]> {
  if (uid) {
    return [await reconcileOne(uid)]
  }

  const db = getFirestore()
  const approvedSellers = await db.collection('sellers').where('status', '==', 'APPROVED').get()
  const results: ReconcileResult[] = []
  for (const doc of approvedSellers.docs) {
    results.push(await reconcileOne(doc.id))
  }
  return results
}

async function main(): Promise<void> {
  const [, , uid] = process.argv

  initializeApp()
  const results = await reconcileRoles(uid)
  for (const result of results) {
    console.log(`${result.uid}: ${result.action}`)
  }
  console.log(`Reconciled ${results.length} account(s) against their sellers/{uid} record.`)
}

// Importing this module (e.g. from its own test file) must never trigger a
// real CLI run as a side effect — see the identical guard in
// promoteSeller.ts/setAdminClaim.ts/repairMissingProfile.ts.
if (require.main === module) {
  void main()
}
