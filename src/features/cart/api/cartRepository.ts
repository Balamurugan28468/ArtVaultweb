import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { CART_MAX_QUANTITY, type CartError } from '../types'

function cartItemsCollection(uid: string) {
  return collection(db, 'carts', uid, 'items')
}

function cartItemDocRef(uid: string, artworkId: string) {
  return doc(db, 'carts', uid, 'items', artworkId)
}

function isFirestoreErrorLike(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error
}

export function toCartError(error: unknown): CartError {
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

export function clampCartQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1
  return Math.min(CART_MAX_QUANTITY, Math.max(1, Math.trunc(quantity)))
}

/**
 * One shared listener over the whole carts/{uid}/items collection — same
 * "exactly one subscription per session" discipline as
 * subscribeWishlistIds, never one listener per line item.
 */
export function subscribeCartQuantities(
  uid: string,
  onData: (quantities: Map<string, number>) => void,
  onError: (error: CartError) => void,
): Unsubscribe {
  return onSnapshot(
    cartItemsCollection(uid),
    (snapshot) => {
      const quantities = new Map<string, number>()
      snapshot.docs.forEach((docSnapshot) => {
        const rawQuantity = docSnapshot.data().quantity
        quantities.set(docSnapshot.id, typeof rawQuantity === 'number' ? clampCartQuantity(rawQuantity) : 1)
      })
      onData(quantities)
    },
    (error) => onError(toCartError(error)),
  )
}

/**
 * Creates a brand-new cart line. `artworkId` is the document id itself —
 * see CartItem's own comment on why it's never duplicated as a field.
 * Deliberately a plain `setDoc` (not merge) — firestore.rules' `create`
 * branch requires `addedAt == request.time`, which only a genuinely new
 * write should ever set; an existing line's quantity is changed via
 * `updateCartItemQuantity` below instead, which leaves `addedAt` untouched
 * (the rule's `update` branch requires exactly that — see the comment on
 * it in firestore.rules for why a merge-write here would fail that check).
 */
export async function createCartItem(uid: string, artworkId: string, quantity: number): Promise<void> {
  try {
    await setDoc(cartItemDocRef(uid, artworkId), { quantity: clampCartQuantity(quantity), addedAt: serverTimestamp() })
  } catch (error) {
    throw toCartError(error)
  }
}

/** Changes only the quantity of an existing cart line — see createCartItem's comment on why this is a separate, narrower write. */
export async function updateCartItemQuantity(uid: string, artworkId: string, quantity: number): Promise<void> {
  try {
    await updateDoc(cartItemDocRef(uid, artworkId), { quantity: clampCartQuantity(quantity) })
  } catch (error) {
    throw toCartError(error)
  }
}

export async function removeCartItem(uid: string, artworkId: string): Promise<void> {
  try {
    await deleteDoc(cartItemDocRef(uid, artworkId))
  } catch (error) {
    throw toCartError(error)
  }
}
