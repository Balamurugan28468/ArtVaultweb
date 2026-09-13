import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { auth as authTrigger } from 'firebase-functions/v1'

initializeApp()

export { approveSellerApplication, moderateArtwork, rejectSellerApplication } from './adminActions'

const DEFAULT_ROLE = 'CUSTOMER'

export interface UserCreateInput {
  uid: string
  email?: string | null
  displayName?: string | null
  photoURL?: string | null
}

/**
 * Backend-authoritative role assignment: the only place a user's role
 * custom claim is ever set. Runs once, right after Firebase Auth creates
 * the account — never triggered or writable by a client.
 *
 * The Firestore write is idempotent (check-then-set inside a transaction),
 * because this is no longer the only path to users/{uid} existing — a
 * client may have already self-provisioned it via
 * src/features/auth/api/ensureUserProfile.ts if this trigger was slow or
 * failed to load (a real, reproduced failure mode of the local Functions
 * emulator under heavy load). This trigger is now defense-in-depth/
 * reconciliation, not a single point of failure, and must never clobber a
 * profile something else already created correctly.
 */
export async function handleUserCreate(user: UserCreateInput): Promise<void> {
  await getAuth().setCustomUserClaims(user.uid, { role: DEFAULT_ROLE })

  const db = getFirestore()
  const ref = db.collection('users').doc(user.uid)

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (snapshot.exists) return

    transaction.set(ref, {
      uid: user.uid,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
      role: DEFAULT_ROLE,
      phoneNumber: null,
      bio: null,
      profileCompleted: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  })
}

export const onUserCreate = authTrigger.user().onCreate(handleUserCreate)
