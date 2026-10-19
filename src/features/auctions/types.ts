import type { Timestamp } from '@/lib/supabase/timestamp'

/**
 * UI-04 — Auctions UI/UX foundation. Matches the planned `auctions/{auctionId}`
 * shape in docs/DATABASE.md and the trusted-timestamp model in
 * docs/AUCTION_ARCHITECTURE.md: `startAt`/`endAt` are explicit trusted
 * `Timestamp` values a future trusted operation sets, never
 * `serverTimestamp()`. No Cloud Function writes this collection yet (see
 * firestore.rules — `allow write: if false` unconditionally), so every
 * document here can only ever be real data from a future trusted writer,
 * never something this app's own client code fabricates.
 *
 * Deliberately no stored `status` field is read or filtered on: nothing
 * exists yet to keep it in sync with real time, and the design doc itself
 * treats client-side time comparison as display-only with zero security
 * authority anyway (see AUCTION_ARCHITECTURE.md's "Trusted time model").
 * `deriveAuctionStatus` below computes SCHEDULED/LIVE/ENDED directly from
 * `startAt`/`endAt` against the real current time instead — always
 * correct, never dependent on an as-yet-unbuilt status-flipping job.
 */
export const AUCTION_STATUSES = ['SCHEDULED', 'LIVE', 'ENDED'] as const

export type AuctionStatus = (typeof AUCTION_STATUSES)[number]

export type AuctionLotStatus = 'OPEN' | 'WINNER_PENDING' | 'SETTLED' | 'NO_BIDS' | 'PAYMENT_EXPIRED'

export interface Auction {
  id: string
  auctionItemId?: string
  artworkId: string
  sellerId: string
  startAt: Timestamp
  endAt: Timestamp
  startingBid: number
  bidIncrement: number
  /** Denormalized, in minor currency units (matches Artwork.price). `null` until a first real bid is ever placed. */
  currentHighBid: number | null
  bidCount: number
  /**
   * Set when the lot closes with a winning bidder.
   */
  winnerUid: string | null
  winningBidAmount: number | null
  lotStatus?: AuctionLotStatus
  paymentWindowExpiresAt?: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** Computes the real, honest display status from trusted timestamps vs. the current time — see this file's own header comment. */
export function deriveAuctionStatus(auction: Pick<Auction, 'startAt' | 'endAt'>, now: Date = new Date()): AuctionStatus {
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
