import type { Timestamp } from '@/lib/supabase/timestamp'

/**
 * Auction display data comes from the trusted public catalog RPC.
 * Stored event status controls activation; timestamps bound the display window.
 * PostgreSQL validates every bid, winner order and lifecycle transition.
 */
export const AUCTION_STATUSES = ['SCHEDULED', 'LIVE', 'ENDED'] as const

export type AuctionStatus = (typeof AUCTION_STATUSES)[number]

export type AuctionLotStatus = 'OPEN' | 'WINNER_PENDING' | 'SETTLED' | 'NO_BIDS' | 'PAYMENT_EXPIRED'
export type AuctionEventStatus = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'ENDED' | 'FINALIZED' | 'CANCELLED'

export interface Auction {
  id: string
  auctionItemId?: string
  auctionStatus?: AuctionEventStatus
  artworkId: string
  sellerId: string
  startAt: Timestamp
  endAt: Timestamp
  startingBid: number
  bidIncrement: number
  /** Denormalized, in minor currency units (matches Artwork.price). `null` until a first real bid is ever placed. */
  currentHighBid: number | null
  bidCount: number
  /** Caller-specific server flag. Public auction data never contains a winner UUID. */
  isWinner: boolean
  winningBidAmount: number | null
  lotStatus?: AuctionLotStatus
  paymentWindowExpiresAt?: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** Display-only status; bidding authorization always uses server state and time. */
export function deriveAuctionStatus(auction: Pick<Auction, 'startAt' | 'endAt' | 'auctionStatus'>, now: Date = new Date()): AuctionStatus {
  if (auction.auctionStatus === 'DRAFT' || auction.auctionStatus === 'SCHEDULED') return 'SCHEDULED'
  if (auction.auctionStatus && ['ENDED', 'FINALIZED', 'CANCELLED'].includes(auction.auctionStatus)) return 'ENDED'
  const nowMs = now.getTime()
  if (nowMs < auction.startAt.toMillis()) return 'SCHEDULED'
  if (nowMs < auction.endAt.toMillis()) return 'LIVE'
  return 'ENDED'
}

/** The minimum amount a next bid must meet — `startingBid` before any bid exists, otherwise the current high bid plus the increment. */
export function minimumNextBid(auction: Pick<Auction, 'startingBid' | 'bidIncrement' | 'currentHighBid'>): number {
  return auction.currentHighBid == null ? auction.startingBid : auction.currentHighBid + auction.bidIncrement
}

export type AuctionErrorCode = 'permission-denied' | 'network' | 'unknown'

export interface AuctionError {
  code: AuctionErrorCode
  message: string
}

export function isAuctionError(value: unknown): value is AuctionError {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value
}

export interface BidHistoryItem {
  bidId: string
  amountMinor: number
  placedAt: Timestamp
  bidderName?: string | null
}

export type PlaceBidResult =
  | { success: true }
  | { success: false; error: 'auction_not_live' | 'lot_not_open' | 'bid_too_low' | 'seller_cannot_bid' | 'already_highest' | 'duplicate_key' | string }

export interface SellerAuctionItem {
  id: string
  auctionId: string
  artworkId: string
  startsAt: Timestamp
  endsAt: Timestamp
  auctionStatus: string
  lotStatus: AuctionLotStatus
  startingBidMinor: number
  bidIncrementMinor: number
  currentHighBid: number
  bidCount: number
  winningBidMinor: number | null
  paymentWindowExpiresAt: Timestamp | null
  winnerOrderId: string | null
  createdAt: Timestamp
}

export interface AdminAuctionRow {
  auctionId: string
  auctionItemId: string
  artworkId: string
  sellerId: string
  startsAt: Timestamp
  endsAt: Timestamp
  auctionStatus: string
  lotStatus: AuctionLotStatus
  startingBidMinor: number
  bidIncrementMinor: number
  currentHighBid: number
  bidCount: number
  winnerBidderId: string | null
  winningBidMinor: number | null
  paymentWindowExpiresAt: Timestamp | null
  winnerOrderId: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type AuctionListState =
  | { status: 'loading' }
  | { status: 'loaded'; auctions: Auction[] }
  | { status: 'error'; error: AuctionError }

export type AuctionDetailState =
  | { status: 'loading' }
  | { status: 'loaded'; auction: Auction; artwork: import('@/features/artwork').Artwork | null }
  | { status: 'missing' }
  | { status: 'error'; error: AuctionError }
