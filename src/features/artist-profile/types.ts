import type { Timestamp } from 'firebase/firestore'

/**
 * Canonical shape of an artists/{artistId} Firestore document (see
 * docs/DATABASE.md). This is a deliberately separate, public-readable
 * projection from sellers/{uid} — it never contains contactEmail,
 * application status, or any other private field, so a public visitor can
 * never reach one by reading this document. `artistId` (the document id)
 * is always the same value as the underlying approved seller's own auth
 * uid — see `uid` below, which mirrors it as a field for convenience.
 */
export interface ArtistProfile {
  uid: string
  displayName: string
  bio: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface UpdateArtistProfileInput {
  displayName: string
  bio: string
}

export type ArtistProfileErrorCode = 'unauthenticated' | 'permission-denied' | 'network' | 'unknown'

export interface ArtistProfileError {
  code: ArtistProfileErrorCode
  message: string
}

export function isArtistProfileError(value: unknown): value is ArtistProfileError {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value
}

export type ArtistProfileState =
  | { status: 'loading' }
  | { status: 'loaded'; profile: ArtistProfile }
  | { status: 'missing' }
  | { status: 'error'; error: ArtistProfileError }
