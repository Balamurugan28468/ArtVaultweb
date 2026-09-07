import type { Timestamp } from 'firebase/firestore'

/**
 * Canonical shape of a wishlists/{uid}/items/{artworkId} Firestore document
 * (see docs/DATABASE.md). Deliberately minimal — `addedAt` only. The
 * artworkId is the document id itself, never duplicated as a field. No
 * artwork snapshot (title/price/image) is ever stored here: the Wishlist
 * page resolves each id's *current* data at render time (see
 * useWishlistArtworks), so a price change or unpublish is reflected
 * immediately rather than showing stale, possibly-misleading data.
 */
export interface WishlistItem {
  artworkId: string
  addedAt: Timestamp
}

export type WishlistErrorCode = 'permission-denied' | 'network' | 'unknown'

export interface WishlistError {
  code: WishlistErrorCode
  message: string
}

export function isWishlistError(value: unknown): value is WishlistError {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value
}

/**
 * 'guest' — signed out, or not yet resolved which account (if any) is
 * signed in; state lives in this browser's localStorage only. 'account' —
 * a real, persisted Firestore wishlist for the signed-in uid.
 */
export type WishlistMode = 'guest' | 'account'
