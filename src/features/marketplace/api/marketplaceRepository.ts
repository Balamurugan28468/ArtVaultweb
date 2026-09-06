import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryConstraint,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { mapToArtwork, toArtworkError, type Artwork } from '@/features/artwork'
import type { MarketplaceCursor, MarketplaceFilters, MarketplacePage } from '../types'

export const MARKETPLACE_PAGE_SIZE = 12

function artworksCollection() {
  return collection(db, 'artworks')
}

/**
 * A price range filter forces the query's first orderBy onto `price` —
 * Firestore requires any inequality-filtered field to be the query's
 * leading sort field, so 'newest' (which orders by `createdAt`) cannot be
 * combined with a price range in a single query. Silently substituting
 * 'price-asc' is the only sort that stays both correct and honest about
 * what Firestore can actually do — see types.ts.
 */
function effectiveSort(filters: MarketplaceFilters): 'newest' | 'price-asc' | 'price-desc' {
  const hasPriceRange = filters.minPrice != null || filters.maxPrice != null
  if (hasPriceRange && filters.sort === 'newest') return 'price-asc'
  return filters.sort
}

/**
 * Builds the exact, deterministic query constraints for one Marketplace
 * page. Every equality/range filter is on a different field than every
 * other, and the query never orders by more than one "real" field plus the
 * document id tiebreaker — this is what keeps the whole filter/sort matrix
 * servable by the small, fixed set of composite indexes in
 * firestore.indexes.json (see that file's own comments for the exact
 * mapping) instead of needing one index per filter combination.
 */
function buildConstraints(filters: MarketplaceFilters, cursor: MarketplaceCursor | null): QueryConstraint[] {
  const constraints: QueryConstraint[] = [where('status', '==', 'PUBLISHED')]

  if (filters.category) {
    constraints.push(where('category', '==', filters.category))
  }
  if (filters.minPrice != null) {
    constraints.push(where('price', '>=', filters.minPrice))
  }
  if (filters.maxPrice != null) {
    constraints.push(where('price', '<=', filters.maxPrice))
  }

  const sort = effectiveSort(filters)
  if (sort === 'newest') {
    constraints.push(orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'))
  } else if (sort === 'price-asc') {
    constraints.push(orderBy('price', 'asc'), orderBy(documentId(), 'asc'))
  } else {
    constraints.push(orderBy('price', 'desc'), orderBy(documentId(), 'desc'))
  }

  if (cursor) {
    constraints.push(startAfter(cursor.primary, cursor.id))
  }
  constraints.push(limit(MARKETPLACE_PAGE_SIZE))

  return constraints
}

/**
 * One page of the public, cross-seller Marketplace catalog. Never a live
 * subscription (see docs/DATABASE.md) — a one-shot read fits the "load
 * more" pagination model much better than a listener that would otherwise
 * need to somehow keep every already-loaded page live and reordered as new
 * artworks are published mid-browse. Public: works whether or not anyone
 * is signed in — the underlying query is exactly the kind
 * firestore.rules' Module 07 PUBLISHED-read branch already documents as
 * safe for cross-seller use (rules evaluate per-document, never by query
 * shape), extended here to actually issue that broader query for the
 * first time.
 */
export async function fetchMarketplacePage(
  filters: MarketplaceFilters,
  cursor: MarketplaceCursor | null,
): Promise<MarketplacePage> {
  try {
    const q = query(artworksCollection(), ...buildConstraints(filters, cursor))
    const snapshot = await getDocs(q)

    const artworks = snapshot.docs
      .map((docSnapshot) => mapToArtwork(docSnapshot.id, docSnapshot.data()))
      .filter((artwork): artwork is Artwork => artwork !== null)

    const lastDoc = snapshot.docs[snapshot.docs.length - 1]
    const hasFullPage = snapshot.docs.length === MARKETPLACE_PAGE_SIZE
    const sort = effectiveSort(filters)

    const nextCursor: MarketplaceCursor | null =
      hasFullPage && lastDoc
        ? { primary: sort === 'newest' ? lastDoc.data().createdAt : lastDoc.data().price, id: lastDoc.id }
        : null

    return { artworks, nextCursor }
  } catch (error) {
    throw toArtworkError(error)
  }
}
