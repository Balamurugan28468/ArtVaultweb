/**
 * One-off operator script — NOT a deployed function, NOT reachable by any
 * client or callable endpoint on its own. `promoteSellerByUid`/
 * `rejectSellerApplicationByUid` are the only ways a seller application is
 * ever decided; there is deliberately no self-service or in-app-by-the-
 * applicant path from PENDING to either outcome (mirrors exactly how
 * ADMIN/SUPER_ADMIN already work — see setAdminClaim.ts). Neither function
 * performs its own authorization check — every caller (this file's own CLI
 * `main()`, or Module 13's `approveSellerApplication`/
 * `rejectSellerApplication` callables in adminActions.ts) MUST authorize
 * the caller itself before invoking either one; these functions trust
 * whoever calls them completely, exactly like every other operator
 * function in this directory.
 *
 * Local (emulator) usage:
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     npm run promote-seller -- <uid> approve
 *     npm run promote-seller -- <uid> reject "does not meet our quality guidelines"
 *
 * Production usage (run only by the project owner, never committed):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npm run promote-seller -- <uid> approve
 */
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

/**
 * Refuses to act if no application exists, or if it has already been
 * decided (APPROVED or REJECTED) — idempotency and one-way-transition
 * guards, never a silent double-grant or a silent overwrite of a prior
 * decision.
 *
 * The read-check-write around `status` runs inside a Firestore transaction,
 * and deliberately runs BEFORE any privilege is ever granted — a
 * nonexistent or already-decided application is rejected without this
 * function touching Auth at all. This closes two things at once: (1) two
 * truly concurrent callers (e.g. two admins, or a race between the CLI and
 * the callable) can never both succeed, because Firestore automatically
 * retries the loser's transaction, which re-reads the just-committed status
 * and correctly throws the same "already decided" error a sequential
 * second call would get; and (2) a caller can never end up with the SELLER
 * claim set for an application that was, in fact, never validly approved.
 * Once the transaction has committed, claim-setting is the first of the
 * remaining writes — if it fails, only the seller's own `status` has
 * changed so far (already durably APPROVED), and the caller can safely
 * retry the whole operation: re-running against an already-APPROVED
 * application would only fail with "already approved" today, so a genuine
 * partial failure here needs the same kind of manual follow-up
 * `reconcileRoles.ts` already exists to perform, not a new mechanism.
 */
export async function promoteSellerByUid(uid: string): Promise<void> {
  const db = getFirestore()
  const sellerRef = db.collection('sellers').doc(uid)

  const sellerData = await db.runTransaction(async (transaction) => {
    const sellerSnapshot = await transaction.get(sellerRef)
    if (!sellerSnapshot.exists) {
      throw new Error(`No seller application found for uid=${uid}.`)
    }
    const data = sellerSnapshot.data() ?? {}
    if (data.status === 'APPROVED') {
      throw new Error(`Seller application for uid=${uid} is already approved.`)
    }
    if (data.status === 'REJECTED') {
      throw new Error(`Seller application for uid=${uid} is already rejected.`)
    }

    transaction.update(sellerRef, {
      status: 'APPROVED',
      reviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return data
  })

  await getAuth().setCustomUserClaims(uid, { role: 'SELLER' })

  // Mirrors the claim onto users/{uid}.role for convenient reads, matching
  // how every other role is mirrored there — never trusted by a rule.
  await db.collection('users').doc(uid).update({ role: 'SELLER', updatedAt: FieldValue.serverTimestamp() })

  // Module 06 — Artist Profiles: the public artists/{uid} projection is
  // created here, at the exact moment (and only the moment) a seller
  // becomes APPROVED, seeded from the just-approved application's own
  // businessName/description. A client can never create this document
  // itself (firestore.rules denies it outright) — this Admin SDK write is
  // the sole path, mirroring exactly how the SELLER claim above is granted.
  await db.collection('artists').doc(uid).set({
    uid,
    displayName: typeof sellerData.businessName === 'string' ? sellerData.businessName : '',
    bio: typeof sellerData.description === 'string' ? sellerData.description : '',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  console.log(`Approved uid=${uid} as SELLER and created their public artist profile.`)
}

/**
 * The rejection counterpart to `promoteSellerByUid` — same trust model (no
 * internal authorization check), same transactional read-check-write for
 * the same concurrency reasons. Rejection grants no privilege and creates
 * no artist profile: it only records the decision and the reason on the
 * existing application document, which stays in place (a persistent
 * record, never deleted). No SELLER claim, no `users/{uid}` write, no
 * `artists/{uid}` write — the applicant's existing CUSTOMER access is left
 * completely untouched. There is deliberately no reapplication/resubmission
 * path for a REJECTED application — `firestore.rules`' `allow update: if
 * false` on `sellers/{uid}` already makes that structurally impossible for
 * any existing document regardless of status, so nothing new needed to be
 * built or blocked for that; see docs/SECURITY.md.
 */
export async function rejectSellerApplicationByUid(uid: string, rejectionReason: string): Promise<void> {
  const db = getFirestore()
  const sellerRef = db.collection('sellers').doc(uid)

  await db.runTransaction(async (transaction) => {
    const sellerSnapshot = await transaction.get(sellerRef)
    if (!sellerSnapshot.exists) {
      throw new Error(`No seller application found for uid=${uid}.`)
    }
    const data = sellerSnapshot.data() ?? {}
    if (data.status === 'APPROVED') {
      throw new Error(`Seller application for uid=${uid} is already approved.`)
    }
    if (data.status === 'REJECTED') {
      throw new Error(`Seller application for uid=${uid} is already rejected.`)
    }

    transaction.update(sellerRef, {
      status: 'REJECTED',
      reviewedAt: FieldValue.serverTimestamp(),
      rejectionReason,
      updatedAt: FieldValue.serverTimestamp(),
    })
  })

  console.log(`Rejected seller application for uid=${uid}.`)
}

async function main(): Promise<void> {
  const [, , uid, decisionArg, ...reasonParts] = process.argv
  const normalizedDecision = decisionArg?.toLowerCase()

  if (!uid || (normalizedDecision !== 'approve' && normalizedDecision !== 'reject')) {
    console.error('Usage: npm run promote-seller -- <uid> <approve|reject> [rejection reason...]')
    process.exitCode = 1
    return
  }
  if (normalizedDecision === 'reject' && reasonParts.length === 0) {
    console.error('A rejection reason is required: npm run promote-seller -- <uid> reject "<reason>"')
    process.exitCode = 1
    return
  }

  initializeApp()
  if (normalizedDecision === 'approve') {
    await promoteSellerByUid(uid)
  } else {
    await rejectSellerApplicationByUid(uid, reasonParts.join(' '))
  }
}

// Only runs when this file is executed directly (`node lib/promoteSeller.js`)
// — not when its exports are imported elsewhere, e.g. by its own test file
// or by adminActions.ts, which must not trigger a real CLI run as a side
// effect of import.
if (require.main === module) {
  void main()
}
