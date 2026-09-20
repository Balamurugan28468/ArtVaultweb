import { describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/lib/supabase/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/data')>()),
  rpc,
}))

const { fetchAllAuctions, getAuction, mapToAuction, toAuctionError } = await import('./auctionsRepository')

const BASE_AUCTION_DATA = {
  artwork_id: 'artwork-1', seller_id: 'seller-1', starts_at: '2026-01-01T00:00:00.000Z',
  ends_at: '2026-01-02T00:00:00.000Z', starting_bid_minor: 500000,
  bid_increment_minor: 10000, current_high_bid: null, bid_count: 0,
  winner_uid: null, winning_bid_amount: null,
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
}

describe('mapToAuction', () => {
  it('maps a well-formed document', () => {
    const auction = mapToAuction('a1', BASE_AUCTION_DATA)
    expect(auction).toMatchObject({ id: 'a1', artworkId: 'artwork-1', sellerId: 'seller-1', startingBid: 500000 })
  })

  it('returns null for a document missing artworkId', () => {
    expect(mapToAuction('a1', { ...BASE_AUCTION_DATA, artwork_id: undefined })).toBeNull()
  })

  it('returns null for a document missing startAt/endAt', () => {
    expect(mapToAuction('a1', { ...BASE_AUCTION_DATA, starts_at: undefined })).toBeNull()
  })

  it('defaults missing numeric/nullable fields rather than throwing', () => {
    const auction = mapToAuction('a1', { artwork_id: 'artwork-1', starts_at: BASE_AUCTION_DATA.starts_at, ends_at: BASE_AUCTION_DATA.ends_at })
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
    rpc.mockResolvedValueOnce([])
    expect(await getAuction('a1')).toBeNull()
  })

  it('returns the mapped auction when it exists', async () => {
    rpc.mockResolvedValueOnce([{ id: 'a1', ...BASE_AUCTION_DATA }])
    const auction = await getAuction('a1')
    expect(auction?.id).toBe('a1')
  })

  it('collapses permission-denied into null rather than throwing', async () => {
    rpc.mockRejectedValueOnce({ code: '42501' })
    expect(await getAuction('a1')).toBeNull()
  })

  it('rethrows a genuine network error as a typed AuctionError', async () => {
    rpc.mockRejectedValueOnce(new TypeError('offline'))
    await expect(getAuction('a1')).rejects.toEqual({
      code: 'network',
      message: 'Network unavailable. Check your connection and try again.',
    })
  })
})

describe('fetchAllAuctions', () => {
  it('reads the public aggregate RPC and maps results', async () => {
    rpc.mockResolvedValueOnce([{ id: 'a1', ...BASE_AUCTION_DATA }])
    const auctions = await fetchAllAuctions()
    expect(rpc).toHaveBeenCalledWith('get_public_auctions')
    expect(auctions).toEqual([expect.objectContaining({ id: 'a1', artworkId: 'artwork-1' })])
  })

  it('returns an empty array when the collection is empty — the honest, correct result today', async () => {
    rpc.mockResolvedValueOnce([])
    expect(await fetchAllAuctions()).toEqual([])
  })

  it('filters out any malformed auction document rather than crashing the list', async () => {
    rpc.mockResolvedValueOnce([{ id: 'bad', seller_id: 'seller-1' }])
    expect(await fetchAllAuctions()).toEqual([])
  })

  it('rethrows a genuine error via toAuctionError', async () => {
    rpc.mockRejectedValueOnce(new TypeError('offline'))
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
