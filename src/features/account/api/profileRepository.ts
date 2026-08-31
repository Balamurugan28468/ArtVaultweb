import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { isUserRole, type UserProfile } from '@/features/auth/types'
import { db } from '@/lib/firebase/config'
import type { AccountError, UpdateUserProfileInput } from '../types'

function userDocRef(uid: string) {
  return doc(db, 'users', uid)
}

function isFirestoreErrorLike(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error
}

export function toAccountError(error: unknown): AccountError {
  if (isFirestoreErrorLike(error)) {
    if (error.code === 'permission-denied') {
      return { code: 'permission-denied', message: 'You do not have permission to do that.' }
    }
    if (error.code === 'unavailable' || error.code === 'deadline-exceeded') {
      return { code: 'network', message: 'Network unavailable. Check your connection and try again.' }
    }
  }
  return { code: 'unknown', message: 'Something went wrong. Please try again.' }
}

/**
 * Defensive mapping from raw Firestore data to UserProfile — never assumes
 * every optional field exists, since a document created before this module
 * shipped predates phoneNumber/bio/profileCompleted. A missing or malformed
 * role is treated as an unreadable profile rather than crashing the UI.
 */
function mapToProfile(uid: string, data: Record<string, unknown>): UserProfile | null {
  if (!isUserRole(data.role)) return null

  return {
    uid,
    email: typeof data.email === 'string' ? data.email : null,
    displayName: typeof data.displayName === 'string' ? data.displayName : null,
    photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
    role: data.role,
    phoneNumber: typeof data.phoneNumber === 'string' ? data.phoneNumber : null,
    bio: typeof data.bio === 'string' ? data.bio : null,
    profileCompleted: data.profileCompleted === true,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now(),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : Timestamp.now(),
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const snapshot = await getDoc(userDocRef(uid))
    if (!snapshot.exists()) return null
    return mapToProfile(uid, snapshot.data())
  } catch (error) {
    throw toAccountError(error)
  }
}

/** Exactly one Firestore listener per call — callers own cleanup via the returned Unsubscribe. */
export function subscribeUserProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void,
  onError: (error: AccountError) => void,
): Unsubscribe {
  return onSnapshot(
    userDocRef(uid),
    (snapshot) => {
      onData(snapshot.exists() ? mapToProfile(uid, snapshot.data()) : null)
    },
    (error) => onError(toAccountError(error)),
  )
}

function deterministicProfileCompleted(input: UpdateUserProfileInput): boolean {
  return Boolean(input.displayName.trim()) && Boolean(input.bio?.trim()) && Boolean(input.phoneNumber?.trim())
}

/**
 * Writes only the fields a customer is allowed to change (see
 * firestore.rules for the server-enforced mirror of this allow-list — uid,
 * email, role, createdAt, and photoURL are never touched here).
 */
export async function updateUserProfile(uid: string, input: UpdateUserProfileInput): Promise<void> {
  try {
    await updateDoc(userDocRef(uid), {
      displayName: input.displayName.trim(),
      phoneNumber: input.phoneNumber?.trim() || null,
      bio: input.bio?.trim() || null,
      profileCompleted: deterministicProfileCompleted(input),
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    throw toAccountError(error)
  }
}
