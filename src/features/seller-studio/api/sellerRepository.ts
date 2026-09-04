import { doc, onSnapshot, serverTimestamp, setDoc, Timestamp, type Unsubscribe } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { isSellerStatus, type SellerApplication, type SellerApplicationInput, type SellerError } from '../types'

function sellerDocRef(uid: string) {
  return doc(db, 'sellers', uid)
}

function isFirestoreErrorLike(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error
}

export function toSellerError(error: unknown): SellerError {
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

/** Defensive mapping — never assumes every field is present or well-typed. */
function mapToSellerApplication(uid: string, data: Record<string, unknown>): SellerApplication | null {
  if (!isSellerStatus(data.status)) return null

  return {
    uid,
    status: data.status,
    businessName: typeof data.businessName === 'string' ? data.businessName : '',
    description: typeof data.description === 'string' ? data.description : '',
    contactEmail: typeof data.contactEmail === 'string' ? data.contactEmail : '',
    appliedAt: data.appliedAt instanceof Timestamp ? data.appliedAt : Timestamp.now(),
    reviewedAt: data.reviewedAt instanceof Timestamp ? data.reviewedAt : null,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now(),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : Timestamp.now(),
  }
}

/** Exactly one Firestore listener per call — callers own cleanup via the returned Unsubscribe. */
export function subscribeSellerApplication(
  uid: string,
  onData: (application: SellerApplication | null) => void,
  onError: (error: SellerError) => void,
): Unsubscribe {
  return onSnapshot(
    sellerDocRef(uid),
    (snapshot) => {
      onData(snapshot.exists() ? mapToSellerApplication(uid, snapshot.data()) : null)
    },
    (error) => onError(toSellerError(error)),
  )
}

/**
 * Submits a seller application. Uses `setDoc` (not `updateDoc`) deliberately:
 * Firestore rules distinguish `create` (no prior document at this path) from
 * `update` (one already exists) based on prior document existence alone,
 * regardless of which client method is called. `firestore.rules` allows
 * `create` here (forcing status to 'PENDING' no matter what the client
 * sends) but denies `update` entirely — so a second `applyAsSeller` call
 * against an existing application (PENDING or APPROVED) is rejected by the
 * server as a duplicate/unauthorized-modification attempt, not just
 * discouraged by the UI. See docs/SECURITY.md.
 */
export async function applyAsSeller(uid: string, input: SellerApplicationInput): Promise<void> {
  try {
    await setDoc(sellerDocRef(uid), {
      uid,
      status: 'PENDING',
      businessName: input.businessName.trim(),
      description: input.description.trim(),
      contactEmail: input.contactEmail.trim(),
      appliedAt: serverTimestamp(),
      reviewedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    throw toSellerError(error)
  }
}
