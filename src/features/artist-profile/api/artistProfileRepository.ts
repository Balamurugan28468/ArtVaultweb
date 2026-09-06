import { doc, getDoc, onSnapshot, serverTimestamp, Timestamp, updateDoc, type Unsubscribe } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { ArtistProfile, ArtistProfileError, UpdateArtistProfileInput } from '../types'

function artistDocRef(uid: string) {
  return doc(db, 'artists', uid)
}

function isFirestoreErrorLike(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error
}

export function toArtistProfileError(error: unknown): ArtistProfileError {
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
function mapToArtistProfile(uid: string, data: Record<string, unknown>): ArtistProfile | null {
  if (typeof data.displayName !== 'string' || typeof data.bio !== 'string') return null

  return {
    uid,
    displayName: data.displayName,
    bio: data.bio,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now(),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : Timestamp.now(),
  }
}

/**
 * Exactly one Firestore listener per call — callers own cleanup via the
 * returned Unsubscribe. Public read (see firestore.rules): works whether or
 * not anyone is signed in.
 */
export function subscribeArtistProfile(
  uid: string,
  onData: (profile: ArtistProfile | null) => void,
  onError: (error: ArtistProfileError) => void,
): Unsubscribe {
  return onSnapshot(
    artistDocRef(uid),
    (snapshot) => {
      onData(snapshot.exists() ? mapToArtistProfile(snapshot.id, snapshot.data()) : null)
    },
    (error) => onError(toArtistProfileError(error)),
  )
}

/**
 * A single one-shot read of just the public display name — never a live
 * subscription — for contexts that show many artists at once (e.g. the
 * Marketplace grid, Module 08) where opening one onSnapshot listener per
 * card would mean dozens of live listeners for a value that essentially
 * never changes mid-browse. Returns `null` for a nonexistent or malformed
 * document, exactly like subscribeArtistProfile's own "missing" case,
 * rather than throwing — a missing artist profile is not itself an error
 * for a caller that only wants a display label.
 */
export async function getArtistDisplayName(uid: string): Promise<string | null> {
  try {
    const snapshot = await getDoc(artistDocRef(uid))
    if (!snapshot.exists()) return null
    const data = snapshot.data()
    return typeof data.displayName === 'string' ? data.displayName : null
  } catch {
    return null
  }
}

/**
 * Writes only the two public fields a seller may change (see
 * firestore.rules for the server-enforced mirror of this allow-list — uid
 * and createdAt are never touched here). The document itself is never
 * created by the client — see functions/src/promoteSeller.ts and
 * reconcileRoles.ts, the only two places an artists/{uid} document is ever
 * written into existence.
 */
export async function updateArtistProfile(uid: string, input: UpdateArtistProfileInput): Promise<void> {
  try {
    await updateDoc(artistDocRef(uid), {
      displayName: input.displayName.trim(),
      bio: input.bio.trim(),
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    throw toArtistProfileError(error)
  }
}
