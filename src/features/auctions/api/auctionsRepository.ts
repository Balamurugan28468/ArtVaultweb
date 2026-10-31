import { dataError, rpc } from '@/lib/supabase/data'
import { timestamp } from '@/lib/supabase/timestamp'
import type {
  AdminAuctionRow,
  Auction,
  AuctionEventStatus,
  AuctionLotStatus,
  BidHistoryItem,
  PlaceBidResult,
  SellerAuctionItem,
} from '../types'

const MAX_AUCTIONS = 200

export const toAuctionError = dataError

/** Defensive against a malformed/partial document the same way mapToArtwork/mapToOrder are. */
export function mapToAuction(id: string, data: Record<string, unknown>): Auction | null {
  const artworkId = typeof data.artwork_id === 'string' ? data.artwork_id : data.artworkId
  const start = typeof data.starts_at === 'string' ? data.starts_at : data.startAt
  const end = typeof data.ends_at === 'string' ? data.ends_at : data.endAt
  if (typeof artworkId !== 'string' || !start || !end) return null

  const winningBidAmount =
    typeof data.winning_bid_minor === 'number'
      ? Number(data.winning_bid_minor)
      : typeof (data.winning_bid_amount ?? data.winningBidAmount) === 'number'
        ? Number(data.winning_bid_amount ?? data.winningBidAmount)
        : null

  const paymentWindowExpiresAt =
    typeof data.payment_window_expires_at === 'string'
      ? timestamp(data.payment_window_expires_at)
      : null

  return {
    id,
    auctionItemId: typeof data.auction_item_id === 'string' ? data.auction_item_id : undefined,
    auctionStatus: typeof data.auction_status === 'string' && ['DRAFT','SCHEDULED','LIVE','ENDED','FINALIZED','CANCELLED'].includes(data.auction_status) ? data.auction_status as AuctionEventStatus : undefined,
    artworkId,
    sellerId: typeof data.seller_id === 'string' ? data.seller_id : typeof data.sellerId === 'string' ? data.sellerId : '',
    startAt: typeof start === 'string' ? timestamp(start) : start as Auction['startAt'],
    endAt: typeof end === 'string' ? timestamp(end) : end as Auction['endAt'],
    startingBid: Number(data.starting_bid_minor ?? data.startingBid ?? 0),
    bidIncrement: Number(data.bid_increment_minor ?? data.bidIncrement ?? 0),
    currentHighBid: typeof (data.current_high_bid ?? data.currentHighBid) === 'number' ? Number(data.current_high_bid ?? data.currentHighBid) : null,
    bidCount: Number(data.bid_count ?? data.bidCount ?? 0),
    isWinner: data.is_current_user_winner === true,
    winningBidAmount,
    lotStatus: (data.lot_status as AuctionLotStatus) ?? 'OPEN',
    paymentWindowExpiresAt,
    createdAt: typeof data.created_at === 'string' ? timestamp(data.created_at) : data.createdAt as Auction['createdAt'],
    updatedAt: typeof data.updated_at === 'string' ? timestamp(data.updated_at) : data.updatedAt as Auction['updatedAt'],
  }
}

/**
 * Every auction, soonest-starting first.
 */
export async function fetchAllAuctions(): Promise<Auction[]> {
  try {
    const rows = (await rpc<Record<string, unknown>[]>('get_public_auctions')) ?? []
    return rows
      .map((row) => mapToAuction(String(row.id), row))
      .filter((auction): auction is Auction => auction !== null)
      .slice(0, MAX_AUCTIONS)
  } catch (error) {
    throw toAuctionError(error)
  }
}

/**
 * One auction by id.
 */
export async function getAuction(auctionId: string,auctionItemId?:string): Promise<Auction | null> {
  try {
    const auctions = await fetchAllAuctions()
    return auctions.find((auction) => auction.id === auctionId && (!auctionItemId || auction.auctionItemId===auctionItemId)) ?? null
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && String(error.code) === 'permission-denied') return null
    throw toAuctionError(error)
  }
}

/**
 * Places a bid via the server-authoritative RPC.
 */
export async function placeBid(
  auctionItemId: string,
  amountMinor: number,
  idempotencyKey: string = crypto.randomUUID()
): Promise<PlaceBidResult> {
  try {
    const result = await rpc<string>('place_bid', {
      p_auction_item_id: auctionItemId,
      p_amount_minor: amountMinor,
      p_idempotency_key: idempotencyKey,
    })

    if (result === 'ok') {
      return { success: true }
    }
    return { success: false, error: result ?? 'unknown' }
  } catch (error) {
    throw toAuctionError(error)
  }
}

/**
 * Fetches public bid amounts and timestamps for an auction lot.
 */
export async function fetchAuctionBidHistory(auctionItemId: string): Promise<BidHistoryItem[]> {
  try {
    const rows = (await rpc<Record<string, unknown>[]>('get_auction_bid_history', {
      p_auction_item_id: auctionItemId,
    })) ?? []

    return rows.map((r) => ({
      bidId: String(r.bid_id),
      amountMinor: Number(r.amount_minor),
      placedAt: timestamp(String(r.placed_at)),
    }))
  } catch (error) {
    throw toAuctionError(error)
  }
}

/**
 * Creates an order for the winning bidder to settle the auction lot.
 */
export async function createAuctionWinnerOrder(auctionItemId: string, shippingAddressId?: string): Promise<string> {
  try {
    const orderId = await rpc<string>('create_auction_winner_order', {
      p_auction_item_id: auctionItemId,
      p_shipping_address_id: shippingAddressId ?? null,
    })
    if (!orderId) {
      throw new Error('Failed to create winner order')
    }
    return orderId
  } catch (error) {
    throw toAuctionError(error)
  }
}

/**
 * Fetches auction items for the current authenticated seller.
 */
export async function fetchSellerAuctionItems(): Promise<SellerAuctionItem[]> {
  try {
    const rows = (await rpc<Record<string, unknown>[]>('get_seller_auction_items')) ?? []
    return rows.map((r) => ({
      id: String(r.id),
      auctionId: String(r.auction_id),
      artworkId: String(r.artwork_id),
      startsAt: timestamp(String(r.starts_at)),
      endsAt: timestamp(String(r.ends_at)),
      auctionStatus: String(r.auction_status),
      lotStatus: r.lot_status as AuctionLotStatus,
      startingBidMinor: Number(r.starting_bid_minor),
      bidIncrementMinor: Number(r.bid_increment_minor),
      currentHighBid: Number(r.current_high_bid),
      bidCount: Number(r.bid_count),
      winningBidMinor: r.winning_bid_minor != null ? Number(r.winning_bid_minor) : null,
      paymentWindowExpiresAt: r.payment_window_expires_at ? timestamp(String(r.payment_window_expires_at)) : null,
      winnerOrderId: r.winner_order_id ? String(r.winner_order_id) : null,
      createdAt: timestamp(String(r.created_at)),
    }))
  } catch (error) {
    throw toAuctionError(error)
  }
}

/**
 * Admin: Fetches all auctions and lots.
 */
export async function fetchAdminAuctions(): Promise<AdminAuctionRow[]> {
  try {
    const rows = (await rpc<Record<string, unknown>[]>('get_admin_auctions')) ?? []
    return rows.map((r) => ({
      auctionId: String(r.auction_id),
      auctionItemId: String(r.auction_item_id),
      artworkId: String(r.artwork_id),
      sellerId: String(r.seller_id),
      startsAt: timestamp(String(r.starts_at)),
      endsAt: timestamp(String(r.ends_at)),
      auctionStatus: String(r.auction_status),
      lotStatus: r.lot_status as AuctionLotStatus,
      startingBidMinor: Number(r.starting_bid_minor),
      bidIncrementMinor: Number(r.bid_increment_minor),
      currentHighBid: Number(r.current_high_bid),
      bidCount: Number(r.bid_count),
      winnerBidderId: r.winner_bidder_id ? String(r.winner_bidder_id) : null,
      winningBidMinor: r.winning_bid_minor != null ? Number(r.winning_bid_minor) : null,
      paymentWindowExpiresAt: r.payment_window_expires_at ? timestamp(String(r.payment_window_expires_at)) : null,
      winnerOrderId: r.winner_order_id ? String(r.winner_order_id) : null,
      createdAt: timestamp(String(r.created_at)),
      updatedAt: timestamp(String(r.updated_at)),
    }))
  } catch (error) {
    throw toAuctionError(error)
  }
}

/**
 * Admin: Schedules a new auction lot.
 */
export async function scheduleAuctionLot(input: {
  artworkId: string
  startsAt: string
  endsAt: string
  startingBidMinor: number
  bidIncrementMinor: number
  paymentWindowHours?: number
}): Promise<string> {
  try {
    const lotId = await rpc<string>('schedule_auction_lot', {
      p_artwork_id: input.artworkId,
      p_starts_at: input.startsAt,
      p_ends_at: input.endsAt,
      p_starting_bid_minor: input.startingBidMinor,
      p_bid_increment_minor: input.bidIncrementMinor,
      p_payment_window_hours: input.paymentWindowHours ?? 24,
    })
    if (!lotId) {
      throw new Error('Failed to schedule auction lot')
    }
    return lotId
  } catch (error) {
    throw toAuctionError(error)
  }
}

/**
 * Admin: Cancels a DRAFT or SCHEDULED auction.
 */
export async function cancelAuction(auctionId: string, reason?: string): Promise<void> {
  try {
    await rpc('cancel_auction', {
      p_auction_id: auctionId,
      p_reason: reason ?? 'Admin cancelled',
    })
  } catch (error) {
    throw toAuctionError(error)
  }
}

/**
 * Admin: Manually activates a SCHEDULED auction to LIVE.
 */
export async function activateAuction(auctionId: string): Promise<void> {
  try {
    await rpc('activate_auction', {
      p_auction_id: auctionId,
    })
  } catch (error) {
    throw toAuctionError(error)
  }
}
