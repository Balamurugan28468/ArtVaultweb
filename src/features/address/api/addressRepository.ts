import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Address, AddressError, AddressInput } from '../types'

function addressesCollection(uid: string) {
  return collection(db, 'addresses', uid, 'entries')
}

function addressDocRef(uid: string, addressId: string) {
  return doc(db, 'addresses', uid, 'entries', addressId)
}

function isFirestoreErrorLike(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error
}

export function toAddressError(error: unknown): AddressError {
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

/** Defensive against a malformed/partial document — a client never assumes every field is present. */
export function mapToAddress(id: string, data: Record<string, unknown>): Address | null {
  if (typeof data.fullName !== 'string' || typeof data.addressLine1 !== 'string') return null
  return {
    id,
    fullName: data.fullName,
    addressLine1: data.addressLine1,
    addressLine2: typeof data.addressLine2 === 'string' ? data.addressLine2 : '',
    city: typeof data.city === 'string' ? data.city : '',
    state: typeof data.state === 'string' ? data.state : '',
    postalCode: typeof data.postalCode === 'string' ? data.postalCode : '',
    country: typeof data.country === 'string' ? data.country : '',
    phone: typeof data.phone === 'string' ? data.phone : '',
    isDefault: data.isDefault === true,
    createdAt: data.createdAt as Address['createdAt'],
    updatedAt: data.updatedAt as Address['updatedAt'],
  }
}

/**
 * The one and only Firestore listener this feature ever opens per signed-in
 * session — a single subscription over the whole `addresses/{uid}/entries`
 * collection (same "one shared listener, not one per card" discipline
 * `subscribeWishlistIds` already established), ordered newest-first so a
 * just-added address appears at the top.
 */
export function subscribeAddresses(
  uid: string,
  onData: (addresses: Address[]) => void,
  onError: (error: AddressError) => void,
): Unsubscribe {
  const addressesQuery = query(addressesCollection(uid), orderBy('createdAt', 'desc'))
  return onSnapshot(
    addressesQuery,
    (snapshot) => {
      const addresses = snapshot.docs
        .map((docSnapshot) => mapToAddress(docSnapshot.id, docSnapshot.data()))
        .filter((address): address is Address => address !== null)
      onData(addresses)
    },
    (error) => onError(toAddressError(error)),
  )
}

/**
 * Adds a real address. `isDefault: true` also clears every other saved
 * address's own `isDefault` flag in the same atomic batch — exactly one
 * address is ever the default at a time, never a client-side-only
 * assumption that could drift from what's actually stored.
 */
export async function addAddress(uid: string, input: AddressInput, existingIds: string[]): Promise<void> {
  try {
    const batch = writeBatch(db)
    const ref = doc(addressesCollection(uid))
    batch.set(ref, { ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    if (input.isDefault) {
      for (const id of existingIds) batch.update(addressDocRef(uid, id), { isDefault: false, updatedAt: serverTimestamp() })
    }
    await batch.commit()
  } catch (error) {
    throw toAddressError(error)
  }
}

export async function updateAddress(uid: string, addressId: string, input: AddressInput, otherIds: string[]): Promise<void> {
  try {
    const batch = writeBatch(db)
    batch.set(addressDocRef(uid, addressId), { ...input, updatedAt: serverTimestamp() }, { merge: true })
    if (input.isDefault) {
      for (const id of otherIds) batch.update(addressDocRef(uid, id), { isDefault: false, updatedAt: serverTimestamp() })
    }
    await batch.commit()
  } catch (error) {
    throw toAddressError(error)
  }
}

/** Sets one address as the default, clearing every other one — a compact version of the same batch `addAddress`/`updateAddress` already do inline, exposed separately for AddressCard's own "Set Default" action. */
export async function setDefaultAddress(uid: string, addressId: string, otherIds: string[]): Promise<void> {
  try {
    const batch = writeBatch(db)
    batch.update(addressDocRef(uid, addressId), { isDefault: true, updatedAt: serverTimestamp() })
    for (const id of otherIds) batch.update(addressDocRef(uid, id), { isDefault: false, updatedAt: serverTimestamp() })
    await batch.commit()
  } catch (error) {
    throw toAddressError(error)
  }
}

export async function deleteAddress(uid: string, addressId: string): Promise<void> {
  try {
    await deleteDoc(addressDocRef(uid, addressId))
  } catch (error) {
    throw toAddressError(error)
  }
}
