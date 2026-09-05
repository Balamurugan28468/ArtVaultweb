import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/config'
import { toAuthErrorMessage } from './authErrors'
import { waitForUserProfileDocument } from './profileReady'
import { waitForRoleClaim } from './roleClaim'

let persistenceReady: Promise<void> | null = null

function ensurePersistence(): Promise<void> {
  // If setPersistence ever fails (rare — e.g. a restrictive browser storage
  // policy), reset to null rather than caching the rejection forever, so
  // the next sign-in/up attempt retries instead of permanently failing.
  persistenceReady ??= setPersistence(auth, browserLocalPersistence).catch((error: unknown) => {
    console.error('Failed to set auth persistence:', error)
    persistenceReady = null
  })
  return persistenceReady
}

export interface SignUpInput {
  email: string
  password: string
  displayName: string
}

export async function signUpWithEmail(input: SignUpInput): Promise<User> {
  await ensurePersistence()
  try {
    const credential = await createUserWithEmailAndPassword(auth, input.email, input.password)
    await updateProfile(credential.user, { displayName: input.displayName })
    // The onUserCreate trigger fires on account creation, before this
    // updateProfile() call — Firebase Auth triggers never see a display
    // name set only via a follow-up client call, so the Firestore profile
    // document it creates always has displayName: null otherwise. Firestore
    // rules already let a user set their own displayName, so the update
    // below closes that gap directly — but the trigger's own Firestore
    // write is asynchronous and not guaranteed to have landed yet, and an
    // `update` against a document that doesn't exist yet is rejected by the
    // rule itself (it can't evaluate the identity checks against a
    // nonexistent `resource.data`). waitForUserProfileDocument waits on
    // that actual precondition — not a fixed delay, not an unrelated proxy
    // signal — so this is deterministic regardless of how long the trigger
    // takes, and a genuine failure (the trigger never runs) throws instead
    // of being silently swallowed.
    await Promise.all([waitForRoleClaim(credential.user), waitForUserProfileDocument(credential.user.uid)])
    await updateDoc(doc(db, 'users', credential.user.uid), {
      displayName: input.displayName,
      updatedAt: serverTimestamp(),
    })
    return credential.user
  } catch (error) {
    throw new Error(toAuthErrorMessage(error))
  }
}

export interface SignInInput {
  email: string
  password: string
}

export async function signInWithEmail(input: SignInInput): Promise<User> {
  await ensurePersistence()
  try {
    const credential = await signInWithEmailAndPassword(auth, input.email, input.password)
    return credential.user
  } catch (error) {
    throw new Error(toAuthErrorMessage(error))
  }
}

export async function signOutUser(): Promise<void> {
  await signOut(auth)
}
