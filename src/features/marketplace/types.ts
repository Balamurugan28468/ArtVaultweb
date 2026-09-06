import type { Timestamp } from 'firebase/firestore'
import type { Artwork, ArtworkCategory, ArtworkError } from '@/features/artwork'

/**
 * The three sort orders Marketplace exposes. 'newest' orders by
 * `createdAt` descending; the two price orders share a single underlying
 * Firestore composite index (see firestore.indexes.json) via Firestore's
 * own "same index, fully reversed" rule — see marketplaceRepository.ts.
 */
export const MARKETPLACE_SORTS = ['newest', 'price-asc', 'price-desc'] as const

export type MarketplaceSort = (typeof MARKETPLACE_SORTS)[number]

export function isMarketplaceSort(value: unknown): value is MarketplaceSort {
  return typeof value === 'string' && (MARKETPLACE_SORTS as readonly string[]).includes(value)
}

/**
 * `category: null` means "all categories" — no equality filter added.
 * `minPrice`/`maxPrice` are whole minor-currency-unit integers (matching
 * Artwork.price), or `null` when unset. A price range is compatible with
 * either price sort; if `sort` is 'newest' while a range is set, the
 * repository silently serves 'price-asc' instead — Firestore requires a
 * range-filtered field to be the query's first orderBy field, so "newest"
 * genuinely cannot be combined with a price range in one query. This is a
 * real Firestore constraint, not an arbitrary restriction — see
 * marketplaceRepository.ts and docs/DATABASE.md.
 */
export interface MarketplaceFilters {
  category: ArtworkCategory | null
  minPrice: number | null
  maxPrice: number | null
  sort: MarketplaceSort
}

export const DEFAULT_MARKETPLACE_FILTERS: MarketplaceFilters = {
  category: null,
  minPrice: null,
  maxPrice: null,
  sort: 'newest',
}

/**
 * Opaque pagination cursor. `primary` is the value of whichever field the
 * active query orders by first (`createdAt` for 'newest', `price` for
 * either price sort); `id` is the document id, the deterministic tiebreak
 * field every query also orders by — see fetchMarketplacePage.
 */
export interface MarketplaceCursor {
  primary: Timestamp | number
  id: string
}

export interface MarketplacePage {
  artworks: Artwork[]
  nextCursor: MarketplaceCursor | null
}

export type MarketplaceError = ArtworkError
