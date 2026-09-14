import { describe, expect, it, vi } from 'vitest'

const { collection, doc, getDoc, getDocs, orderBy, query } = vi.hoisted(() => ({
  collection: vi.fn(() => ({ path: 'auctions' })),
  doc: vi.fn(() => ({ path: 'auctions/a1' })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  orderBy: vi.fn(() => 'ORDER_BY'),
  query: vi.fn(() => 'QUERY'),
}))

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return { ...actual, collection, doc, getDoc, getDocs, orderBy, query }
})
vi.mock('@/lib/firebase/config', () => ({ db: {} }))

const { fetchAllAuctions, getAuction, mapToAuction, toAuctionError } = await import('./auctionsRepository')

const BASE_AUCTION_DATA = {
  artworkId: 'artwork-1',
  sellerId: 'seller-1',
  startAt: { toMillis: () => 1000 },
  endAt: { toMillis: () => 2000 },
  startingBid: 500000,
  bidIncrement: 10000,
  currentHighBid: null,
  bidCount: 0,
  winnerUid: null,
  winningBidAmount: null,
  createdAt: { toDate: () => new Date('2026-01-01') },
  updatedAt: { toDate: () => new Date('2026-01-01') },
}

describe('mapToAuction', () => {
  it('maps a well-formed document', () => {
    const auction = mapToAuction('a1', BASE_AUCTION_DATA)
    expect(auction).toMatchObject({ id: 'a1', artworkId: 'artwork-1', sellerId: 'seller-1', startingBid: 500000 })
  })

  it('returns null for a document missing artworkId', () => {
    expect(mapToAuction('a1', { ...BASE_AUCTION_DATA, artworkId: undefined })).toBeNull()
  })

  it('returns null for a document missing startAt/endAt', () => {
    expect(mapToAuction('a1', { ...BASE_AUCTION_DATA, startAt: undefined })).toBeNull()
  })

  it('defaults missing numeric/nullable fields rather than throwing', () => {
    const auction = mapToAuction('a1', { artworkId: 'artwork-1', startAt: BASE_AUCTION_DATA.startAt, endAt: BASE_AUCTION_DATA.endAt })
    expect(auction).toMatchObject({
      sellerId: '',
      startingBid: 0,
      bidIncrement: 0,
      currentHighBid: null,
      bidCount: 0,
      winnerUid: null,
      winningBidAmount: null,
    })
  })

  it('never fabricates currentHighBid, winnerUid, or winningBidAmount when absent', () => {
    const auction = mapToAuction('a1', BASE_AUCTION_DATA)
    expect(auction?.currentHighBid).toBeNull()
    expect(auction?.winnerUid).toBeNull()
    expect(auction?.winningBidAmount).toBeNull()
  })
})

describe('getAuction', () => {
  it('returns null for a nonexistent auction', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => false })
    expect(await getAuction('a1')).toBeNull()
  })

  it('returns the mapped auction when it exists', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => true, id: 'a1', data: () => BASE_AUCTION_DATA })
    const auction = await getAuction('a1')
    expect(auction?.id).toBe('a1')
  })

  it('collapses permission-denied into null rather than throwing', async () => {
    getDoc.mockRejectedValueOnce({ code: 'permission-denied' })
    expect(await getAuction('a1')).toBeNull()
  })

  it('rethrows a genuine network error as a typed AuctionError', async () => {
    getDoc.mockRejectedValueOnce({ code: 'unavailable' })
    await expect(getAuction('a1')).rejects.toEqual({
      code: 'network',
      message: 'Network unavailable. Check your connection and try again.',
    })
  })
})

describe('fetchAllAuctions', () => {
  it('orders by startAt ascending and maps results', async () => {
    getDocs.mockResolvedValueOnce({ docs: [{ id: 'a1', data: () => BASE_AUCTION_DATA }] })
    const auctions = await fetchAllAuctions()
    expect(orderBy).toHaveBeenCalledWith('startAt', 'asc')
    expect(auctions).toEqual([expect.objectContaining({ id: 'a1', artworkId: 'artwork-1' })])
  })

  it('returns an empty array when the collection is empty — the honest, correct result today', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] })
    expect(await fetchAllAuctions()).toEqual([])
  })

  it('filters out any malformed auction document rather than crashing the list', async () => {
    getDocs.mockResolvedValueOnce({ docs: [{ id: 'bad', data: () => ({ sellerId: 'seller-1' }) }] })
    expect(await fetchAllAuctions()).toEqual([])
  })

  it('rethrows a genuine error via toAuctionError', async () => {
    getDocs.mockRejectedValueOnce({ code: 'unavailable' })
    await expect(fetchAllAuctions()).rejects.toEqual({
      code: 'network',
      message: 'Network unavailable. Check your connection and try again.',
    })
  })
})

describe('toAuctionError', () => {
  it('falls back to unknown for an unrecognized error', () => {
    expect(toAuctionError(new Error('boom'))).toEqual({ code: 'unknown', message: 'Something went wrong. Please try again.' })
  })
})
