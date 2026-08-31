import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { auth as authTrigger } from 'firebase-functions/v1'

initializeApp()

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
 */
export async function handleUserCreate(user: UserCreateInput): Promise<void> {
  await getAuth().setCustomUserClaims(user.uid, { role: DEFAULT_ROLE })

  await getFirestore().collection('users').doc(user.uid).set({
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
}

export const onUserCreate = authTrigger.user().onCreate(handleUserCreate)
