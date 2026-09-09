import { doc, getDoc, increment, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { LikeError } from '../types'

function likeDocRef(artworkId: string, uid: string) {
  return doc(db, 'likes', artworkId, 'by', uid)
}

function artworkDocRef(artworkId: string) {
  return doc(db, 'artworks', artworkId)
}

function isFirestoreErrorLike(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error
}

export function toLikeError(error: unknown): LikeError {
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
 * A one-shot read — never a listener — for whether `uid` currently likes
 * `artworkId`; checked once per Detail Page visit, matching
 * `usePublicArtwork`'s own one-shot convention (Module 11). `get`-only,
 * owner-scoped by `firestore.rules` (`likes/{artworkId}/by/{uid}`), so this
 * can only ever be called for the signed-in caller's own uid.
 */
export async function hasLiked(artworkId: string, uid: string): Promise<boolean> {
  try {
    const snapshot = await getDoc(likeDocRef(artworkId, uid))
    return snapshot.exists()
  } catch (error) {
    throw toLikeError(error)
  }
}

/**
 * One atomic write batch — creates the caller's own like document and
 * increments the artwork's denormalized `likeCount` together, or neither
 * write happens at all. This exact pair of writes is the only shape
 * `firestore.rules`' `isValidLikeCountUpdate` / `likes/{artworkId}/by/{uid}`
 * match block (Module 12 Phase 2) ever allows — never a separate
 * read-count-then-write, which could never be proven atomic or drift-free.
 */
export async function likeArtwork(artworkId: string, uid: string): Promise<void> {
  try {
    const batch = writeBatch(db)
    batch.set(likeDocRef(artworkId, uid), { likedAt: serverTimestamp() })
    batch.update(artworkDocRef(artworkId), { likeCount: increment(1) })
    await batch.commit()
  } catch (error) {
    throw toLikeError(error)
  }
}

/** The exact mirror of `likeArtwork` — one atomic batch, delete + decrement together. */
export async function unlikeArtwork(artworkId: string, uid: string): Promise<void> {
  try {
    const batch = writeBatch(db)
    batch.delete(likeDocRef(artworkId, uid))
    batch.update(artworkDocRef(artworkId), { likeCount: increment(-1) })
    await batch.commit()
  } catch (error) {
    throw toLikeError(error)
  }
}

export interface AuthoritativeLikeState {
  liked: boolean
  likeCount: number
}

/**
 * A defensive re-read of ground truth — never a guess — used only to
 * reconcile UI state after a like/unlike batch comes back rejected (Module
 * 12 Phase 4 hardening). Under genuine concurrent activation of the same
 * uid+artwork (e.g. two tabs), the real Firestore emulator has been
 * observed to occasionally reject *both* racing batches' client promises
 * even though exactly one of them did commit server-side — this reads the
 * real like document and the real likeCount so the caller can tell "my
 * write actually landed, the rejection was noise" apart from "my write
 * genuinely never happened," instead of trusting the rejection at face
 * value either way. A read failure here (e.g. real network loss) is left
 * to propagate — the caller falls back to an ordinary rollback rather than
 * guessing.
 */
export async function getAuthoritativeLikeState(artworkId: string, uid: string): Promise<AuthoritativeLikeState> {
  try {
    const [likeSnapshot, artworkSnapshot] = await Promise.all([getDoc(likeDocRef(artworkId, uid)), getDoc(artworkDocRef(artworkId))])
    const rawCount = artworkSnapshot.data()?.likeCount
    const likeCount = typeof rawCount === 'number' && rawCount >= 0 ? rawCount : 0
    return { liked: likeSnapshot.exists(), likeCount }
  } catch (error) {
    throw toLikeError(error)
  }
}
