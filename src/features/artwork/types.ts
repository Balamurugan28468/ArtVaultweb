import type { Timestamp } from '@/lib/supabase/timestamp'

export const ARTWORK_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'PUBLISHED',
  'REJECTED',
  'SUSPENDED',
] as const

export type ArtworkStatus = (typeof ARTWORK_STATUSES)[number]

export function isArtworkStatus(
  value: unknown,
): value is ArtworkStatus {
  return (
    typeof value === 'string' &&
    (ARTWORK_STATUSES as readonly string[]).includes(value)
  )
}

export const ARTWORK_CATEGORIES = [
  'painting',
  'sculpture',
  'photography',
  'digital',
  'other',
] as const

export type ArtworkCategory =
  (typeof ARTWORK_CATEGORIES)[number]

export function isArtworkCategory(
  value: unknown,
): value is ArtworkCategory {
  return (
    typeof value === 'string' &&
    (ARTWORK_CATEGORIES as readonly string[]).includes(value)
  )
}

export const ARTWORK_IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export type ArtworkImageContentType =
  (typeof ARTWORK_IMAGE_CONTENT_TYPES)[number]

export function isArtworkImageContentType(
  value: unknown,
): value is ArtworkImageContentType {
  return (
    typeof value === 'string' &&
    (
      ARTWORK_IMAGE_CONTENT_TYPES as readonly string[]
    ).includes(value)
  )
}

export const ARTWORK_MAX_IMAGE_BYTES =
  10 * 1024 * 1024

export const ARTWORK_MAX_IMAGES = 6

export interface ArtworkImage {
  id: string
  path: string
  url: string
  order: number
  contentType: ArtworkImageContentType
  size: number
}

export interface Artwork {
  id: string
  sellerId: string

  title: string
  description: string

  /**
   * Integer price in minor currency units.
   * For INR this represents paise.
   */
  price: number

  category: ArtworkCategory
  tags: string[]

  images: ArtworkImage[]

  inventoryCount: number

  /**
   * Quantity temporarily reserved by active checkout/order operations.
   */
  reservedCount?: number

  status: ArtworkStatus

  reviewedAt: Timestamp | null
  rejectionReason: string | null

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

export type ArtworkErrorCode =
  | 'unauthenticated'
  | 'permission-denied'
  | 'network'
  | 'unknown'

export interface ArtworkError {
  code: ArtworkErrorCode
  message: string
}

export function isArtworkError(
  value: unknown,
): value is ArtworkError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value
  )
}

export type ArtworkListState =
  | {
      status: 'loading'
    }
  | {
      status: 'loaded'
      artworks: Artwork[]
    }
  | {
      status: 'error'
      error: ArtworkError
    }

export type ArtworkState =
  | {
      status: 'loading'
    }
  | {
      status: 'loaded'
      artwork: Artwork
    }
  | {
      status: 'missing'
    }
  | {
      status: 'error'
      error: ArtworkError
    }