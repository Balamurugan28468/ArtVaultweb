/**
 * One-off operator script — NOT a deployed function, NOT reachable by any
 * client or callable endpoint. This is the only way a seller application is
 * ever approved; there is deliberately no self-service or in-app path from
 * PENDING to APPROVED (mirrors exactly how ADMIN/SUPER_ADMIN already work —
 * see setAdminClaim.ts). Refuses to act if no application exists, or if it
 * is already approved (idempotency — running this twice is a no-op error,
 * never a silent double-grant).
 *
 * Local (emulator) usage:
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     npm run promote-seller -- <uid>
 *
 * Production usage (run only by the project owner, never committed):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npm run promote-seller -- <uid>
 */
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

export async function promoteSellerByUid(uid: string): Promise<void> {
  const db = getFirestore()
  const sellerRef = db.collection('sellers').doc(uid)
  const sellerSnapshot = await sellerRef.get()

  if (!sellerSnapshot.exists) {
    throw new Error(`No seller application found for uid=${uid}.`)
  }
  if (sellerSnapshot.data()?.status === 'APPROVED') {
    throw new Error(`Seller application for uid=${uid} is already approved.`)
  }

  // Role claim first — if this step fails, nothing else has changed yet.
  await getAuth().setCustomUserClaims(uid, { role: 'SELLER' })

  // Mirrors the claim onto users/{uid}.role for convenient reads, matching
  // how every other role is mirrored there — never trusted by a rule.
  await db.collection('users').doc(uid).update({ role: 'SELLER', updatedAt: FieldValue.serverTimestamp() })

  await sellerRef.update({
    status: 'APPROVED',
    reviewedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  console.log(`Approved uid=${uid} as SELLER.`)
}

async function main(): Promise<void> {
  const [, , uid] = process.argv

  if (!uid) {
    console.error('Usage: npm run promote-seller -- <uid>')
    process.exitCode = 1
    return
  }

  initializeApp()
  await promoteSellerByUid(uid)
}

// Only runs when this file is executed directly (`node lib/promoteSeller.js`)
// — not when `promoteSellerByUid` is imported elsewhere, e.g. by its own
// test file, which must not trigger a real CLI run as a side effect of import.
if (require.main === module) {
  void main()
}
