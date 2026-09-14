import { collection, doc, getDoc, getDocs, orderBy, query, type Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Auction, AuctionError } from '../types'

// A weekly-curated auction catalog is expected to stay small — an
// unbounded per-status query (see fetchAllAuctions) would not scale to a
// large open marketplace, but nothing in this codebase writes this
// collection yet (see firestore.rules), so there is no real data volume to
// paginate around today. Bounded defensively rather than truly unbounded.
const MAX_AUCTIONS = 200

function isFirestoreErrorLike(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error
}

export function toAuctionError(error: unknown): AuctionError {
  if (isFirestoreErrorLike(error)) {
    if (error.code === 'permission-denied') {
      return { code: 'permission-denied', message: 'You do not have permission to view that auction.' }
    }
    if (error.code === 'unavailable' || error.code === 'deadline-exceeded') {
      return { code: 'network', message: 'Network unavailable. Check your connection and try again.' }
    }
  }
  return { code: 'unknown', message: 'Something went wrong. Please try again.' }
}

/** Defensive against a malformed/partial document the same way mapToArtwork/mapToOrder are — a client never assumes every field is present. */
export function mapToAuction(id: string, data: Record<string, unknown>): Auction | null {
  if (typeof data.artworkId !== 'string' || !data.startAt || !data.endAt) return null
  return {
    id,
    artworkId: data.artworkId,
    sellerId: typeof data.sellerId === 'string' ? data.sellerId : '',
    startAt: data.startAt as Timestamp,
    endAt: data.endAt as Timestamp,
    startingBid: typeof data.startingBid === 'number' ? data.startingBid : 0,
    bidIncrement: typeof data.bidIncrement === 'number' ? data.bidIncrement : 0,
    currentHighBid: typeof data.currentHighBid === 'number' ? data.currentHighBid : null,
    bidCount: typeof data.bidCount === 'number' ? data.bidCount : 0,
    winnerUid: typeof data.winnerUid === 'string' ? data.winnerUid : null,
    winningBidAmount: typeof data.winningBidAmount === 'number' ? data.winningBidAmount : null,
    createdAt: data.createdAt as Auction['createdAt'],
    updatedAt: data.updatedAt as Auction['updatedAt'],
  }
}

function auctionsCollection() {
  return collection(db, 'auctions')
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
    const q = query(auctionsCollection(), orderBy('startAt', 'asc'))
    const snapshot = await getDocs(q)
    return snapshot.docs
      .map((docSnapshot) => mapToAuction(docSnapshot.id, docSnapshot.data()))
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
    const snapshot = await getDoc(doc(db, 'auctions', auctionId))
    return snapshot.exists() ? mapToAuction(snapshot.id, snapshot.data()) : null
  } catch (error) {
    if (isFirestoreErrorLike(error) && error.code === 'permission-denied') return null
    throw toAuctionError(error)
  }
}
