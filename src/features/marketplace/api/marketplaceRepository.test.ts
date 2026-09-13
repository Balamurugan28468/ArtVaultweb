import { Timestamp } from 'firebase/firestore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarketplaceFilters } from '../types'

const { collection, documentId, getCountFromServer, getDocs, limit, orderBy, query, startAfter, where } = vi.hoisted(() => ({
  collection: vi.fn(() => ({ path: 'artworks' })),
  documentId: vi.fn(() => '__name__'),
  getCountFromServer: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn((n: number) => ({ type: 'limit', n })),
  orderBy: vi.fn((field: string, direction: string) => ({ type: 'orderBy', field, direction })),
  query: vi.fn((...args: unknown[]) => ({ args })),
  startAfter: vi.fn((...args: unknown[]) => ({ type: 'startAfter', args })),
  where: vi.fn((field: string, op: string, value: unknown) => ({ type: 'where', field, op, value })),
}))

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return { ...actual, collection, documentId, getCountFromServer, getDocs, limit, orderBy, query, startAfter, where }
})
vi.mock('@/lib/firebase/config', () => ({ db: {} }))

const { fetchCategoryArtworkCounts, fetchMarketplacePage, MARKETPLACE_PAGE_SIZE } = await import('./marketplaceRepository')

const BASE_FILTERS: MarketplaceFilters = { category: null, minPrice: null, maxPrice: null, sort: 'newest' }

// These mocks are shared module-level `vi.fn()`s (see the `vi.hoisted` block
// above), so their call history otherwise accumulates across every test in
// this file — several tests below assert on exclusivity (`not.toHaveBeenCalledWith`)
// or an exact call, which is only meaningful against this test's own calls.
beforeEach(() => {
  collection.mockClear()
  documentId.mockClear()
  getCountFromServer.mockClear()
  getDocs.mockClear()
  limit.mockClear()
  orderBy.mockClear()
  query.mockClear()
  startAfter.mockClear()
  where.mockClear()
})

function artworkDoc(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    data: () => ({
      sellerId: 'alice',
      title: 'Sunset',
      description: 'd',
      price: 500,
      category: 'painting',
      tags: [],
      images: [],
      inventoryCount: 1,
      status: 'PUBLISHED',
      createdAt: Timestamp.fromMillis(1000),
      updatedAt: Timestamp.fromMillis(1000),
      ...overrides,
    }),
  }
}

describe('fetchMarketplacePage', () => {
  it('always filters by status == PUBLISHED, regardless of other filters', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] })
    await fetchMarketplacePage(BASE_FILTERS, null)
    expect(where).toHaveBeenCalledWith('status', '==', 'PUBLISHED')
  })

  it('adds a category equality filter only when one is selected', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] })
    await fetchMarketplacePage({ ...BASE_FILTERS, category: 'sculpture' }, null)
    expect(where).toHaveBeenCalledWith('category', '==', 'sculpture')
  })

  it('adds no category filter when category is null', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] })
    await fetchMarketplacePage(BASE_FILTERS, null)
    expect(where).not.toHaveBeenCalledWith('category', '==', expect.anything())
  })

  it('orders by createdAt desc (plus a document-id tiebreaker) for the newest sort', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] })
    await fetchMarketplacePage({ ...BASE_FILTERS, sort: 'newest' }, null)
    expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc')
    expect(orderBy).toHaveBeenCalledWith('__name__', 'desc')
  })

  it('orders by price asc for the price-asc sort', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] })
    await fetchMarketplacePage({ ...BASE_FILTERS, sort: 'price-asc' }, null)
    expect(orderBy).toHaveBeenCalledWith('price', 'asc')
    expect(orderBy).toHaveBeenCalledWith('__name__', 'asc')
  })

  it('orders by price desc for the price-desc sort', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] })
    await fetchMarketplacePage({ ...BASE_FILTERS, sort: 'price-desc' }, null)
    expect(orderBy).toHaveBeenCalledWith('price', 'desc')
    expect(orderBy).toHaveBeenCalledWith('__name__', 'desc')
  })

  it('adds price range filters when a min/max is set', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] })
    await fetchMarketplacePage({ ...BASE_FILTERS, minPrice: 100, maxPrice: 900 }, null)
    expect(where).toHaveBeenCalledWith('price', '>=', 100)
    expect(where).toHaveBeenCalledWith('price', '<=', 900)
  })

  it('silently serves price-asc instead of newest when a price range is active — Firestore requires the ranged field to lead the sort', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] })
    await fetchMarketplacePage({ ...BASE_FILTERS, sort: 'newest', minPrice: 100 }, null)
    expect(orderBy).toHaveBeenCalledWith('price', 'asc')
    expect(orderBy).not.toHaveBeenCalledWith('createdAt', expect.anything())
  })

  it('passes an explicit price-desc sort through unchanged even with a price range active', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] })
    await fetchMarketplacePage({ ...BASE_FILTERS, sort: 'price-desc', minPrice: 100 }, null)
    expect(orderBy).toHaveBeenCalledWith('price', 'desc')
  })

  it('applies startAfter using the supplied cursor', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] })
    await fetchMarketplacePage(BASE_FILTERS, { primary: Timestamp.fromMillis(500), id: 'a1' })
    expect(startAfter).toHaveBeenCalledWith(Timestamp.fromMillis(500), 'a1')
  })

  it('maps returned documents to Artworks, dropping malformed ones', async () => {
    getDocs.mockResolvedValueOnce({ docs: [artworkDoc('a1'), { id: 'bad', data: () => ({ status: 'NOT_REAL' }) }] })
    const page = await fetchMarketplacePage(BASE_FILTERS, null)
    expect(page.artworks.map((a) => a.id)).toEqual(['a1'])
  })

  it('returns a nextCursor built from the last doc when a full page comes back', async () => {
    const docs = Array.from({ length: MARKETPLACE_PAGE_SIZE }, (_, i) => artworkDoc(`a${i}`, { createdAt: Timestamp.fromMillis(1000 + i) }))
    getDocs.mockResolvedValueOnce({ docs })
    const page = await fetchMarketplacePage(BASE_FILTERS, null)
    expect(page.nextCursor).toEqual({ primary: Timestamp.fromMillis(1000 + MARKETPLACE_PAGE_SIZE - 1), id: `a${MARKETPLACE_PAGE_SIZE - 1}` })
  })

  it('returns nextCursor: null when fewer than a full page comes back (end of results)', async () => {
    getDocs.mockResolvedValueOnce({ docs: [artworkDoc('a1')] })
    const page = await fetchMarketplacePage(BASE_FILTERS, null)
    expect(page.nextCursor).toBeNull()
  })

  it('uses the price field for the cursor when sorting by price', async () => {
    const docs = Array.from({ length: MARKETPLACE_PAGE_SIZE }, (_, i) => artworkDoc(`a${i}`, { price: 100 + i }))
    getDocs.mockResolvedValueOnce({ docs })
    const page = await fetchMarketplacePage({ ...BASE_FILTERS, sort: 'price-asc' }, null)
    expect(page.nextCursor).toEqual({ primary: 100 + MARKETPLACE_PAGE_SIZE - 1, id: `a${MARKETPLACE_PAGE_SIZE - 1}` })
  })

  it('throws a typed ArtworkError when the read is denied', async () => {
    getDocs.mockRejectedValueOnce({ code: 'permission-denied' })
    await expect(fetchMarketplacePage(BASE_FILTERS, null)).rejects.toEqual({
      code: 'permission-denied',
      message: 'You do not have permission to do that.',
    })
  })
})

// UI-01 reference-driven Explore rebuild — real counts via a count-only
// aggregation query, never a fabricated or client-computed-from-a-partial-
// page number.
describe('fetchCategoryArtworkCounts', () => {
  it('always filters every count query by status == PUBLISHED', async () => {
    getCountFromServer.mockResolvedValue({ data: () => ({ count: 0 }) })
    await fetchCategoryArtworkCounts()
    expect(where).toHaveBeenCalledWith('status', '==', 'PUBLISHED')
  })

  it('returns a real total and a real count per category, from real aggregation reads', async () => {
    // Distinguishes the total query from a per-category one by inspecting
    // the actual `where` clauses attached to the query object it receives
    // (via the hoisted `query`/`where` mocks above) — robust regardless of
    // call order, rather than assuming Promise.all resolves array elements
    // in a particular sequence.
    getCountFromServer.mockImplementation((q: { args: unknown[] }) => {
      const hasCategoryFilter = q.args.some((arg) => (arg as { field?: string })?.field === 'category')
      return Promise.resolve({ data: () => ({ count: hasCategoryFilter ? 10 : 42 }) })
    })
    const result = await fetchCategoryArtworkCounts()

    expect(result.total).toBe(42)
    expect(result.byCategory).toEqual({ painting: 10, sculpture: 10, photography: 10, digital: 10, other: 10 })
    // One total query + one per fixed category — never an unbounded number
    // of reads.
    expect(getCountFromServer).toHaveBeenCalledTimes(6)
  })

  it('throws a typed ArtworkError rather than returning a partial/fabricated result on failure', async () => {
    getCountFromServer.mockRejectedValueOnce({ code: 'unavailable' })
    await expect(fetchCategoryArtworkCounts()).rejects.toMatchObject({ code: 'network' })
  })
})
