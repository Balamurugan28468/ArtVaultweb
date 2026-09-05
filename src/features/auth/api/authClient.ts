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
import { ensureUserProfile } from './ensureUserProfile'

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
    // A brand-new account is always CUSTOMER — never a guess, never
    // dependent on onUserCreate having run yet — so ensureUserProfile can
    // guarantee the canonical document exists right now, synchronously with
    // sign-up itself, instead of waiting on an out-of-band Cloud Function.
    await ensureUserProfile(credential.user, { role: 'CUSTOMER', displayName: input.displayName })
    // The onUserCreate trigger, if and when it runs, never sees a display
    // name set only via the follow-up updateProfile() call above — closing
    // that gap is a plain, always-allowed update now that ensureUserProfile
    // has already guaranteed the document exists.
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
