import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import {
  isArtworkCategory,
  isArtworkImageContentType,
  isArtworkStatus,
  type Artwork,
  type ArtworkDraftInput,
  type ArtworkError,
  type ArtworkImage,
} from '../types'

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

/** Defensive mapping — never assumes every image entry is present or well-typed; drops anything malformed rather than crashing. */
function mapToArtworkImage(value: unknown): ArtworkImage | null {
  if (typeof value !== 'object' || value === null) return null
  const image = value as Record<string, unknown>
  if (typeof image.id !== 'string' || typeof image.path !== 'string' || typeof image.url !== 'string') return null
  if (!isArtworkImageContentType(image.contentType)) return null
  if (typeof image.order !== 'number' || typeof image.size !== 'number') return null

  return { id: image.id, path: image.path, url: image.url, order: image.order, contentType: image.contentType, size: image.size }
}

function mapToArtworkImages(value: unknown): ArtworkImage[] {
  if (!Array.isArray(value)) return []
  return value.map(mapToArtworkImage).filter((image): image is ArtworkImage => image !== null)
}

/**
 * Defensive mapping — never assumes every field is present or well-typed.
 * Exported for reuse by other public read paths over the same collection
 * (see marketplaceRepository.ts, Module 08) — the mapping itself doesn't
 * change across query shapes, only which documents a given query can ever
 * return.
 */
export function mapToArtwork(id: string, data: Record<string, unknown>): Artwork | null {
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
    images: mapToArtworkImages(data.images),
    inventoryCount: typeof data.inventoryCount === 'number' ? data.inventoryCount : 0,
    status: data.status,
    reviewedAt: data.reviewedAt instanceof Timestamp ? data.reviewedAt : null,
    rejectionReason: typeof data.rejectionReason === 'string' ? data.rejectionReason : null,
    likeCount: typeof data.likeCount === 'number' && data.likeCount >= 0 ? data.likeCount : 0,
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

/**
 * An artist's real, publicly-visible catalog — Module 07's own query,
 * consumed by the public artist page (never by Seller Studio, which uses
 * subscribeSellerArtworks above to see everything regardless of status).
 * `sellerId == X && status == 'PUBLISHED'` is two equality filters on
 * different fields, which Firestore serves from its automatic single-field
 * indexes without needing a composite index. Public — works whether or not
 * anyone is signed in (see firestore.rules' additive PUBLISHED-read branch).
 */
export function subscribePublishedArtworks(
  sellerId: string,
  onData: (artworks: Artwork[]) => void,
  onError: (error: ArtworkError) => void,
): Unsubscribe {
  const q = query(artworksCollection(), where('sellerId', '==', sellerId), where('status', '==', 'PUBLISHED'))
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

/**
 * A single one-shot read — never a live subscription — for contexts that
 * need many artworks' current data at once without opening one listener
 * per artwork (e.g. resolving a saved Wishlist's items, Module 09). Returns
 * `null` for a nonexistent, malformed, or permission-denied document rather
 * than throwing: a wishlist entry whose artwork was since deleted or
 * unpublished is an ordinary, expected case for that caller to render as
 * "no longer available," not an error.
 */
export async function getArtwork(id: string): Promise<Artwork | null> {
  try {
    const snapshot = await getDoc(artworkDocRef(id))
    return snapshot.exists() ? mapToArtwork(snapshot.id, snapshot.data()) : null
  } catch {
    return null
  }
}

/**
 * The public Artwork Detail page's own read (Module 11) — same one-shot
 * `getDoc` as `getArtwork` above, but with deliberately different error
 * semantics. `getArtwork` exists to resolve *many* ids at once (a saved
 * Wishlist), where any single failure — including a genuine network error —
 * should just make that one item look "unavailable" rather than fail the
 * whole list, so it swallows every error into `null`. A dedicated detail
 * page needs the opposite: a real network/unavailable failure should
 * surface as a retryable error to the one visitor looking at it, not
 * collapse into the same "this doesn't exist" state a private or
 * nonexistent artwork correctly gets. `permission-denied` is the one
 * Firestore error still mapped to `null` here, for exactly the same privacy
 * reason `getArtwork` maps it to `null` too: a private artwork the caller
 * isn't allowed to read must stay indistinguishable from one that was never
 * published or never existed, never leaked via a different code path.
 */
export async function getPublicArtwork(id: string): Promise<Artwork | null> {
  try {
    const snapshot = await getDoc(artworkDocRef(id))
    return snapshot.exists() ? mapToArtwork(snapshot.id, snapshot.data()) : null
  } catch (error) {
    if (isFirestoreErrorLike(error) && error.code === 'permission-denied') return null
    throw toArtworkError(error)
  }
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

/**
 * The single write path for every images-array change (add, remove,
 * reorder). Runs inside a transaction rather than a plain updateDoc() so two
 * uploads finishing back-to-back (e.g. a seller selecting several photos at
 * once) each apply their change on top of the other's, instead of the
 * second overwriting the array from a stale read — the same class of race a
 * plain read-then-updateDoc() would otherwise have. Firestore evaluates
 * security rules against this transaction's write exactly as it would any
 * other update, so an attempt to mutate images on an artwork that is no
 * longer DRAFT (e.g. submitted from another tab in between) is still
 * rejected server-side, not just guarded by the client-side check below.
 */
export async function mutateArtworkImages(
  id: string,
  updater: (images: ArtworkImage[]) => ArtworkImage[],
): Promise<ArtworkImage[]> {
  try {
    return await runTransaction(db, async (transaction) => {
      const ref = artworkDocRef(id)
      const snapshot = await transaction.get(ref)
      if (!snapshot.exists()) {
        throw { code: 'unknown', message: 'This artwork no longer exists.' } satisfies ArtworkError
      }
      const data = snapshot.data()
      if (!isArtworkStatus(data.status) || data.status !== 'DRAFT') {
        throw { code: 'permission-denied', message: 'This artwork can no longer be edited.' } satisfies ArtworkError
      }
      const nextImages = updater(mapToArtworkImages(data.images))
      transaction.update(ref, { images: nextImages, updatedAt: serverTimestamp() })
      return nextImages
    })
  } catch (error) {
    if (isArtworkErrorLike(error)) throw error
    throw toArtworkError(error)
  }
}

// Distinguishes an ArtworkError literal thrown deliberately above from a raw
// FirebaseError (also has `code`/`message`, but is an Error instance) — the
// latter must still go through toArtworkError() for a safe, user-facing
// message instead of leaking Firestore's own internal wording.
function isArtworkErrorLike(error: unknown): error is ArtworkError {
  return typeof error === 'object' && error !== null && !(error instanceof Error) && 'code' in error && 'message' in error
}
