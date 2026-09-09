import type { Timestamp } from 'firebase/firestore'

// Module 04 implemented the first two states (DRAFT/SUBMITTED — a seller's
// own private editing lifecycle). Module 07 adds the two outcomes of
// trusted review: PUBLISHED (the first genuinely public artwork state) and
// REJECTED. Deliberately not added yet: PENDING_REVIEW (redundant with
// what SUBMITTED already means — "locked, awaiting review" — without a
// genuinely separate transition to justify a second state for the same
// thing), and every commerce/auction/AI/admin-enforcement state
// (AVAILABLE/RESERVED/SOLD, IN_AUCTION/AUCTION_SOLD, AI_PROCESSING,
// SUSPENDED/CANCELLED) — each belongs to a module that doesn't exist yet
// and could never transition an artwork out of it, which is worse than not
// having the state at all. See docs/DATABASE.md.
export const ARTWORK_STATUSES = ['DRAFT', 'SUBMITTED', 'PUBLISHED', 'REJECTED'] as const

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
 * `reviewedAt`/`rejectionReason` are set only by the trusted
 * `functions/src/publishArtwork.ts` operator script (Module 07) — never by
 * a client — the moment a SUBMITTED artwork is published or rejected;
 * `null` until then, and `rejectionReason` stays `null` for a published
 * artwork too.
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
  reviewedAt: Timestamp | null
  rejectionReason: string | null
  /**
   * Denormalized count of `likes/{artworkId}/by/*` documents (Module 12).
   * Only ever changed atomically alongside a like/unlike write batch — see
   * `firestore.rules`' `isValidLikeCountUpdate`. Pre-Module-12 documents
   * were backfilled to 0 (`functions/src/backfillLikeCount.ts`), but a
   * client read must still tolerate a missing/malformed value defensively
   * (see `mapToArtwork` below) rather than assume every document has it.
   */
  likeCount: number
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
