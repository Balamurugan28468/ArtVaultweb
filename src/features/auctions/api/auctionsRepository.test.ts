import { describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/lib/supabase/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/data')>()),
  rpc,
}))

const {
  activateAuction,
  cancelAuction,
  createAuctionWinnerOrder,
  fetchAllAuctions,
  fetchAdminAuctions,
  fetchAuctionBidHistory,
  fetchSellerAuctionItems,
  getAuction,
  mapToAuction,
  placeBid,
  scheduleAuctionLot,
  toAuctionError,
} = await import('./auctionsRepository')

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

describe('Module 5 auction functions', () => {
  it('placeBid calls place_bid RPC and handles ok and error codes', async () => {
    rpc.mockResolvedValueOnce('ok')
    const res1 = await placeBid('lot-1', 500000, 'test-key')
    expect(rpc).toHaveBeenCalledWith('place_bid', {
      p_auction_item_id: 'lot-1',
      p_amount_minor: 500000,
      p_idempotency_key: 'test-key',
    })
    expect(res1).toEqual({ success: true })

    rpc.mockResolvedValueOnce('bid_too_low')
    const res2 = await placeBid('lot-1', 400000, 'test-key-2')
    expect(res2).toEqual({ success: false, error: 'bid_too_low' })
  })

  it('fetchAuctionBidHistory calls get_auction_bid_history and maps rows', async () => {
    rpc.mockResolvedValueOnce([
      { bid_id: 'b1', amount_minor: 550000, placed_at: '2026-01-01T12:00:00.000Z' },
    ])
    const bids = await fetchAuctionBidHistory('lot-1')
    expect(rpc).toHaveBeenCalledWith('get_auction_bid_history', { p_auction_item_id: 'lot-1' })
    expect(bids).toHaveLength(1)
    expect(bids[0].amountMinor).toBe(550000)
    expect(bids[0].bidId).toBe('b1')
  })

  it('createAuctionWinnerOrder calls create_auction_winner_order RPC', async () => {
    rpc.mockResolvedValueOnce('order-123')
    const orderId = await createAuctionWinnerOrder('lot-1')
    expect(rpc).toHaveBeenCalledWith('create_auction_winner_order', { p_auction_item_id: 'lot-1' })
    expect(orderId).toBe('order-123')
  })

  it('fetchSellerAuctionItems calls get_seller_auction_items RPC', async () => {
    rpc.mockResolvedValueOnce([
      {
        id: 'lot-1',
        auction_id: 'a1',
        artwork_id: 'art-1',
        starts_at: '2026-01-01T00:00:00.000Z',
        ends_at: '2026-01-02T00:00:00.000Z',
        auction_status: 'LIVE',
        lot_status: 'OPEN',
        starting_bid_minor: 100000,
        bid_increment_minor: 10000,
        current_high_bid: 120000,
        bid_count: 2,
        winning_bid_minor: null,
        payment_window_expires_at: null,
        winner_order_id: null,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ])
    const items = await fetchSellerAuctionItems()
    expect(rpc).toHaveBeenCalledWith('get_seller_auction_items')
    expect(items).toHaveLength(1)
    expect(items[0].lotStatus).toBe('OPEN')
    expect(items[0].currentHighBid).toBe(120000)
  })

  it('fetchAdminAuctions calls get_admin_auctions RPC', async () => {
    rpc.mockResolvedValueOnce([])
    const rows = await fetchAdminAuctions()
    expect(rpc).toHaveBeenCalledWith('get_admin_auctions')
    expect(rows).toEqual([])
  })

  it('scheduleAuctionLot calls schedule_auction_lot RPC', async () => {
    rpc.mockResolvedValueOnce('new-lot-id')
    const lotId = await scheduleAuctionLot({
      artworkId: 'art-1',
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-01-02T00:00:00.000Z',
      startingBidMinor: 100000,
      bidIncrementMinor: 10000,
      paymentWindowHours: 24,
    })
    expect(rpc).toHaveBeenCalledWith('schedule_auction_lot', expect.objectContaining({
      p_artwork_id: 'art-1',
      p_starting_bid_minor: 100000,
    }))
    expect(lotId).toBe('new-lot-id')
  })

  it('cancelAuction and activateAuction call respective admin RPCs', async () => {
    rpc.mockResolvedValueOnce(null)
    await cancelAuction('a1', 'test cancel')
    expect(rpc).toHaveBeenCalledWith('cancel_auction', { p_auction_id: 'a1', p_reason: 'test cancel' })

    rpc.mockResolvedValueOnce(null)
    await activateAuction('a1')
    expect(rpc).toHaveBeenCalledWith('activate_auction', { p_auction_id: 'a1' })
  })
})
