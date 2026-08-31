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
    await waitForRoleClaim(credential.user)
    // The onUserCreate trigger fires on account creation, before this
    // updateProfile() call — Firebase Auth triggers never see a display
    // name set only via a follow-up client call, so the Firestore profile
    // document it creates always has displayName: null otherwise. Firestore
    // rules already let a user set their own displayName, so this closes
    // that gap directly. Best-effort: waitForRoleClaim resolving means the
    // trigger's own (earlier, in-process) Firestore write has almost
    // certainly already completed, but if it hasn't yet, this fails
    // harmlessly — the user can still set their name via Edit Profile.
    await updateDoc(doc(db, 'users', credential.user.uid), {
      displayName: input.displayName,
      updatedAt: serverTimestamp(),
    }).catch((error: unknown) => {
      console.error('Failed to sync display name to the profile document:', error)
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
