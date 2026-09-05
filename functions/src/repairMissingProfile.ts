/**
 * One-off operator script — NOT a deployed function, NOT reachable by any
 * client or callable endpoint. Recovery path for a real, reproduced failure
 * mode: a Firebase Auth user exists but its users/{uid} Firestore document
 * was never created, because the onUserCreate trigger did not run (or did
 * not finish) at the moment that account was created — observed during
 * Module 04 owner acceptance testing and traced to the local Functions
 * emulator's discovery step timing out under heavy concurrent system load
 * (see ARTVAULT_PROJECT_STATE.md). No client-side code can safely repair
 * this — creating a Firestore document a client isn't allowed to create is
 * exactly what firestore.rules exists to prevent — so this reuses
 * handleUserCreate, the exact same already-tested provisioning logic the
 * trigger itself runs, sourced from the real current Auth user record. It
 * can never diverge from what a normal sign-up would have produced and can
 * never grant anything beyond the same CUSTOMER default every new account
 * gets — there is no role parameter. Refuses to act if a profile document
 * already exists (idempotent — never overwrites real data or creates a
 * duplicate).
 *
 * Local (emulator) usage:
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     npm run repair-missing-profile -- <uid>
 *
 * Production usage (run only by the project owner, never committed):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npm run repair-missing-profile -- <uid>
 */
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { handleUserCreate } from './index'

export async function repairMissingProfile(uid: string): Promise<'repaired' | 'already-exists'> {
  const existing = await getFirestore().collection('users').doc(uid).get()
  if (existing.exists) {
    return 'already-exists'
  }

  const userRecord = await getAuth().getUser(uid)
  await handleUserCreate({
    uid: userRecord.uid,
    email: userRecord.email ?? null,
    displayName: userRecord.displayName ?? null,
    photoURL: userRecord.photoURL ?? null,
  })
  return 'repaired'
}

async function main(): Promise<void> {
  const [, , uid] = process.argv

  if (!uid) {
    console.error('Usage: npm run repair-missing-profile -- <uid>')
    process.exitCode = 1
    return
  }

  const result = await repairMissingProfile(uid)
  console.log(
    result === 'repaired'
      ? `Repaired missing profile for uid=${uid} (role: CUSTOMER).`
      : `users/${uid} already exists — no changes made.`,
  )
}

// Importing this module (e.g. from its own test file) must never trigger a
// real CLI run as a side effect — see the identical guard in
// promoteSeller.ts/setAdminClaim.ts.
if (require.main === module) {
  void main()
}
