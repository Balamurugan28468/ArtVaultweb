import type { Timestamp } from 'firebase/firestore'

// Module 04 deliberately implements only the first two states of the full
// artwork lifecycle — PENDING_REVIEW/APPROVED/PUBLISHED/etc. all need a
// reviewer or marketplace that doesn't exist yet, and a status nothing can
// ever leave is worse than not having it. See docs/DATABASE.md.
export const ARTWORK_STATUSES = ['DRAFT', 'SUBMITTED'] as const

export type ArtworkStatus = (typeof ARTWORK_STATUSES)[number]

export function isArtworkStatus(value: unknown): value is ArtworkStatus {
  return typeof value === 'string' && (ARTWORK_STATUSES as readonly string[]).includes(value)
}

// A small, hardcoded set for this foundation module — not an admin-managed
// taxonomy. Revisited when Marketplace/Search need real category filtering.
export const ARTWORK_CATEGORIES = ['painting', 'sculpture', 'photography', 'digital', 'other'] as const

export type ArtworkCategory = (typeof ARTWORK_CATEGORIES)[number]

export function isArtworkCategory(value: unknown): value is ArtworkCategory {
  return typeof value === 'string' && (ARTWORK_CATEGORIES as readonly string[]).includes(value)
}

/**
 * Canonical shape of an artworks/{artworkId} Firestore document (see
 * docs/DATABASE.md). `price` is an integer number of minor currency units
 * (paise, i.e. price * 100) — never a float — so it can never accumulate
 * floating-point rounding error; the UI is the only place that ever
 * converts to/from whole-rupee display values. `images` stays an empty
 * array through Module 04 — real Storage-backed upload is Module 05.
 */
export interface Artwork {
  id: string
  sellerId: string
  title: string
  description: string
  price: number
  category: ArtworkCategory
  tags: string[]
  images: string[]
  inventoryCount: number
  status: ArtworkStatus
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface ArtworkDraftInput {
  title: string
  description: string
  price: number
  category: string
  tags: string[]
  inventoryCount: number
}

export type ArtworkErrorCode = 'unauthenticated' | 'permission-denied' | 'network' | 'unknown'

export interface ArtworkError {
  code: ArtworkErrorCode
  message: string
}

export function isArtworkError(value: unknown): value is ArtworkError {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value
}

export type ArtworkListState =
  | { status: 'loading' }
  | { status: 'loaded'; artworks: Artwork[] }
  | { status: 'error'; error: ArtworkError }

export type ArtworkState =
  | { status: 'loading' }
  | { status: 'loaded'; artwork: Artwork }
  | { status: 'missing' }
  | { status: 'error'; error: ArtworkError }
