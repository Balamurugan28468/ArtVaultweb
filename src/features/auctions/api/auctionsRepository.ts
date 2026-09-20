import { dataError, rpc } from '@/lib/supabase/data'
import { timestamp } from '@/lib/supabase/timestamp'
import type { Auction } from '../types'

// A weekly-curated auction catalog is expected to stay small — an
// unbounded per-status query (see fetchAllAuctions) would not scale to a
// large open marketplace, but nothing in this codebase writes this
// collection yet (see firestore.rules), so there is no real data volume to
// paginate around today. Bounded defensively rather than truly unbounded.
const MAX_AUCTIONS = 200

export const toAuctionError = dataError

/** Defensive against a malformed/partial document the same way mapToArtwork/mapToOrder are — a client never assumes every field is present. */
export function mapToAuction(id: string, data: Record<string, unknown>): Auction | null {
  const artworkId = typeof data.artwork_id === 'string' ? data.artwork_id : data.artworkId
  const start = typeof data.starts_at === 'string' ? data.starts_at : data.startAt
  const end = typeof data.ends_at === 'string' ? data.ends_at : data.endAt
  if (typeof artworkId !== 'string' || !start || !end) return null
  return {
    id,
    artworkId,
    sellerId: typeof data.seller_id === 'string' ? data.seller_id : typeof data.sellerId === 'string' ? data.sellerId : '',
    startAt: typeof start === 'string' ? timestamp(start) : start as Auction['startAt'],
    endAt: typeof end === 'string' ? timestamp(end) : end as Auction['endAt'],
    startingBid: Number(data.starting_bid_minor ?? data.startingBid ?? 0),
    bidIncrement: Number(data.bid_increment_minor ?? data.bidIncrement ?? 0),
    currentHighBid: typeof (data.current_high_bid ?? data.currentHighBid) === 'number' ? Number(data.current_high_bid ?? data.currentHighBid) : null,
    bidCount: Number(data.bid_count ?? data.bidCount ?? 0),
    winnerUid: typeof data.winner_uid === 'string' ? data.winner_uid : typeof data.winnerUid === 'string' ? data.winnerUid : null,
    winningBidAmount: typeof (data.winning_bid_amount ?? data.winningBidAmount) === 'number' ? Number(data.winning_bid_amount ?? data.winningBidAmount) : null,
    createdAt: typeof data.created_at === 'string' ? timestamp(data.created_at) : data.createdAt as Auction['createdAt'],
    updatedAt: typeof data.updated_at === 'string' ? timestamp(data.updated_at) : data.updatedAt as Auction['updatedAt'],
  }
}

/**
 * Every auction, soonest-starting first — public (firestore.rules grants
 * `allow read: if true` on `auctions/{auctionId}`, same posture as a
 * PUBLISHED artwork), one-shot (not a listener; a landing page bucketed
 * into Upcoming/Live/Past by real time doesn't need a live subscription any
 * more than Marketplace's own paginated read does). Genuinely returns an
 * empty list today for every real deployment, since nothing writes this
 * collection yet (see AuctionsPage's own honest empty states per section) —
 * that is the correct, honest result, not a bug.
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
 * One auction by id. `permission-denied` collapses to `null` for the same
 * reason `getArtwork`/`getOrder` do — though auctions are publicly
 * readable today, so this only matters if that rule narrows in the future.
 */
export async function getAuction(auctionId: string): Promise<Auction | null> {
  try {
    const auctions = await fetchAllAuctions()
    return auctions.find((auction) => auction.id === auctionId) ?? null
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && String(error.code) === 'permission-denied') return null
    throw toAuctionError(error)
  }
}
