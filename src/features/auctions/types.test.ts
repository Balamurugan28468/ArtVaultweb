import { describe, expect, it } from 'vitest'
import { deriveAuctionStatus, minimumNextBid } from './types'

function ts(ms: number) {
  return { toMillis: () => ms } as unknown as import('firebase/firestore').Timestamp
}

describe('deriveAuctionStatus', () => {
  const auction = { startAt: ts(1000), endAt: ts(2000) }

  it('is SCHEDULED before startAt', () => {
    expect(deriveAuctionStatus(auction, new Date(500))).toBe('SCHEDULED')
  })

  it('is LIVE between startAt and endAt', () => {
    expect(deriveAuctionStatus(auction, new Date(1500))).toBe('LIVE')
  })

  it('is ENDED at or after endAt', () => {
    expect(deriveAuctionStatus(auction, new Date(2000))).toBe('ENDED')
    expect(deriveAuctionStatus(auction, new Date(9999))).toBe('ENDED')
  })
})

describe('minimumNextBid', () => {
  it('is the starting bid when no bid has been placed yet', () => {
    expect(minimumNextBid({ startingBid: 500000, bidIncrement: 10000, currentHighBid: null })).toBe(500000)
  })

  it('is the current high bid plus the increment once a bid exists', () => {
    expect(minimumNextBid({ startingBid: 500000, bidIncrement: 10000, currentHighBid: 520000 })).toBe(530000)
  })
})
