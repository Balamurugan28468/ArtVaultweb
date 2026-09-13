import type { Timestamp } from 'firebase/firestore'

/**
 * Canonical shape of a carts/{uid}/items/{artworkId} Firestore document
 * (see docs/DATABASE.md, firestore.rules). Mirrors WishlistItem's own
 * "store the minimum, resolve the rest live" philosophy — no artwork
 * snapshot (title/price/image) is ever stored here, so a price change or
 * unpublish is reflected immediately on the Cart page rather than showing
 * stale, possibly-misleading data (see useCartLines). `quantity` is the one
 * field a wishlist entry never needed.
 */
export interface CartItem {
  artworkId: string
  quantity: number
  addedAt: Timestamp
}

export type CartErrorCode = 'permission-denied' | 'network' | 'unknown'

export interface CartError {
  code: CartErrorCode
  message: string
}

export function isCartError(value: unknown): value is CartError {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value
}

/**
 * 'guest' — signed out, or not yet resolved which account (if any) is
 * signed in; state lives in this browser's localStorage only. 'account' —
 * a real, persisted Firestore cart for the signed-in uid. Same two modes
 * as WishlistMode, for the same reason: a visitor can start building a
 * cart before creating an account, exactly like saving to a wishlist.
 */
export type CartMode = 'guest' | 'account'

export const CART_MAX_QUANTITY = 99
