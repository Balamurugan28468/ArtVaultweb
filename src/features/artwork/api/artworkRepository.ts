import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { isArtworkCategory, isArtworkStatus, type Artwork, type ArtworkDraftInput, type ArtworkError } from '../types'

function artworksCollection() {
  return collection(db, 'artworks')
}

function artworkDocRef(id: string) {
  return doc(db, 'artworks', id)
}

function isFirestoreErrorLike(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error
}

export function toArtworkError(error: unknown): ArtworkError {
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
function mapToArtwork(id: string, data: Record<string, unknown>): Artwork | null {
  if (typeof data.sellerId !== 'string') return null
  if (!isArtworkStatus(data.status)) return null

  return {
    id,
    sellerId: data.sellerId,
    title: typeof data.title === 'string' ? data.title : '',
    description: typeof data.description === 'string' ? data.description : '',
    price: typeof data.price === 'number' ? data.price : 0,
    category: isArtworkCategory(data.category) ? data.category : 'other',
    tags: Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    images: Array.isArray(data.images) ? data.images.filter((img): img is string => typeof img === 'string') : [],
    inventoryCount: typeof data.inventoryCount === 'number' ? data.inventoryCount : 0,
    status: data.status,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now(),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : Timestamp.now(),
  }
}

/**
 * All of a seller's own artworks, newest-edit-first. Sorted client-side
 * (not `orderBy('updatedAt')` in the query) deliberately — a seller's own
 * catalog is small at foundation stage, and this sidesteps needing a
 * composite index for an equality-plus-order-by-different-field query
 * before Module 04 has any real query-pattern data to size one against.
 */
export function subscribeSellerArtworks(
  sellerId: string,
  onData: (artworks: Artwork[]) => void,
  onError: (error: ArtworkError) => void,
): Unsubscribe {
  const q = query(artworksCollection(), where('sellerId', '==', sellerId))
  return onSnapshot(
    q,
    (snapshot) => {
      const artworks = snapshot.docs
        .map((docSnapshot) => mapToArtwork(docSnapshot.id, docSnapshot.data()))
        .filter((artwork): artwork is Artwork => artwork !== null)
        .sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())
      onData(artworks)
    },
    (error) => onError(toArtworkError(error)),
  )
}

/** Exactly one Firestore listener per call — callers own cleanup via the returned Unsubscribe. */
export function subscribeArtwork(
  id: string,
  onData: (artwork: Artwork | null) => void,
  onError: (error: ArtworkError) => void,
): Unsubscribe {
  return onSnapshot(
    artworkDocRef(id),
    (snapshot) => {
      onData(snapshot.exists() ? mapToArtwork(snapshot.id, snapshot.data()) : null)
    },
    (error) => onError(toArtworkError(error)),
  )
}

export async function createArtworkDraft(sellerId: string, input: ArtworkDraftInput): Promise<string> {
  try {
    const ref = await addDoc(artworksCollection(), {
      sellerId,
      title: input.title.trim(),
      description: input.description.trim(),
      price: input.price,
      category: input.category,
      tags: input.tags,
      images: [],
      inventoryCount: input.inventoryCount,
      status: 'DRAFT',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return ref.id
  } catch (error) {
    throw toArtworkError(error)
  }
}

/** Only ever called while an artwork is still DRAFT — firestore.rules rejects this once SUBMITTED. */
export async function updateArtworkDraft(id: string, input: ArtworkDraftInput): Promise<void> {
  try {
    await updateDoc(artworkDocRef(id), {
      title: input.title.trim(),
      description: input.description.trim(),
      price: input.price,
      category: input.category,
      tags: input.tags,
      inventoryCount: input.inventoryCount,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    throw toArtworkError(error)
  }
}

/** One-way for this module: DRAFT -> SUBMITTED only. firestore.rules rejects the reverse. */
export async function submitArtwork(id: string): Promise<void> {
  try {
    await updateDoc(artworkDocRef(id), { status: 'SUBMITTED', updatedAt: serverTimestamp() })
  } catch (error) {
    throw toArtworkError(error)
  }
}

/** Only ever called while an artwork is still DRAFT — firestore.rules rejects deleting a SUBMITTED one. */
export async function deleteArtworkDraft(id: string): Promise<void> {
  try {
    await deleteDoc(artworkDocRef(id))
  } catch (error) {
    throw toArtworkError(error)
  }
}
