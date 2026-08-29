import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { auth } from '@/lib/firebase/config'
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
