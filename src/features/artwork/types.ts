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

// Module 05 — Artwork Media/Image Upload. Kept intentionally small (a JPEG/
// PNG/WebP allowlist, a byte ceiling comfortable for a phone/DSLR photo
// without inviting abuse, and a per-artwork count a seller can reasonably
// browse) — see docs/DATABASE.md and storage.rules, which enforce the same
// values server-side rather than trusting these as anything more than the
// client's first line of feedback.
export const ARTWORK_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type ArtworkImageContentType = (typeof ARTWORK_IMAGE_CONTENT_TYPES)[number]

export function isArtworkImageContentType(value: unknown): value is ArtworkImageContentType {
  return typeof value === 'string' && (ARTWORK_IMAGE_CONTENT_TYPES as readonly string[]).includes(value)
}

export const ARTWORK_MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const ARTWORK_MAX_IMAGES = 6

/**
 * One uploaded artwork photo. `path` is the owner-scoped Cloud Storage
 * object path (`artworks/{sellerId}/{artworkId}/{id}`, see
 * artworkImageStorage.ts) — the trusted identifier; `url` is a download URL
 * resolved once at upload time purely so the UI can render an <img> without
 * re-resolving it on every load. `order` is a small dense integer the
 * seller controls via reordering; it is never assumed unique or contiguous
 * by any reader, only used as a sort key.
 */
export interface ArtworkImage {
  id: string
  path: string
  url: string
  order: number
  contentType: ArtworkImageContentType
  size: number
}

/**
 * Canonical shape of an artworks/{artworkId} Firestore document (see
 * docs/DATABASE.md). `price` is an integer number of minor currency units
 * (paise, i.e. price * 100) — never a float — so it can never accumulate
 * floating-point rounding error; the UI is the only place that ever
 * converts to/from whole-rupee display values. `images` holds real
 * Storage-backed uploads (Module 05) once the artwork exists — it can only
 * ever be non-empty after the artwork's initial DRAFT creation (see
 * firestore.rules), and is locked the instant the artwork is SUBMITTED.
 */
export interface Artwork {
  id: string
  sellerId: string
  title: string
  description: string
  price: number
  category: ArtworkCategory
  tags: string[]
  images: ArtworkImage[]
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
