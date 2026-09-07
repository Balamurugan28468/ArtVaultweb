import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { WishlistError } from '../types'

function wishlistItemsCollection(uid: string) {
  return collection(db, 'wishlists', uid, 'items')
}

function wishlistItemDocRef(uid: string, artworkId: string) {
  return doc(db, 'wishlists', uid, 'items', artworkId)
}

function isFirestoreErrorLike(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error
}

export function toWishlistError(error: unknown): WishlistError {
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
 * The one and only Firestore listener this feature ever opens per signed-in
 * session — a single subscription over the whole `wishlists/{uid}/items`
 * collection, shared by every card's save button and the /wishlist page via
 * WishlistProvider, never one listener per artwork (see
 * docs/DATABASE.md's Module 09 section on why this matters for a
 * Marketplace-sized grid).
 */
export function subscribeWishlistIds(
  uid: string,
  onData: (artworkIds: Set<string>) => void,
  onError: (error: WishlistError) => void,
): Unsubscribe {
  return onSnapshot(
    wishlistItemsCollection(uid),
    (snapshot) => onData(new Set(snapshot.docs.map((docSnapshot) => docSnapshot.id))),
    (error) => onError(toWishlistError(error)),
  )
}

/** `artworkId` is the document id itself — writing it twice as a field would be pure redundancy. */
export async function addWishlistItem(uid: string, artworkId: string): Promise<void> {
  try {
    await setDoc(wishlistItemDocRef(uid, artworkId), { addedAt: serverTimestamp() })
  } catch (error) {
    throw toWishlistError(error)
  }
}

export async function removeWishlistItem(uid: string, artworkId: string): Promise<void> {
  try {
    await deleteDoc(wishlistItemDocRef(uid, artworkId))
  } catch (error) {
    throw toWishlistError(error)
  }
}
