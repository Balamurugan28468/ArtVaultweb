import { useEffect, useState } from 'react'
import { deriveAuctionStatus, type Auction, type AuctionStatus } from '../types'

export interface AuctionCountdown {
  status: AuctionStatus
  /** Milliseconds until the next real transition (startAt for SCHEDULED, endAt for LIVE) — `0` once ENDED. */
  remainingMs: number
}

/**
 * A real, ticking countdown against the auction's own trusted `startAt`/
 * `endAt` — display-only, exactly as docs/AUCTION_ARCHITECTURE.md's
 * "Trusted time model" specifies: this has zero security authority, it
 * only ever reads the local clock and two real Firestore timestamps, never
 * a fabricated duration. `intervalMs` defaults to 1s so an "Ends in ..."
 * display reads as genuinely live; tests pass a shorter/mocked interval.
 */
export function useAuctionCountdown(auction: Pick<Auction, 'startAt' | 'endAt'>, intervalMs = 1000): AuctionCountdown {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  const status = deriveAuctionStatus(auction, now)
  const targetMs = status === 'SCHEDULED' ? auction.startAt.toMillis() : auction.endAt.toMillis()
  const remainingMs = status === 'ENDED' ? 0 : Math.max(0, targetMs - now.getTime())

  return { status, remainingMs }
}

export interface CountdownParts {
  days: number
  hours: number
  minutes: number
  seconds: number
}

/** Splits a duration into whole days/hours/minutes/seconds — shared by `formatCountdown`'s inline text and `AuctionCountdownBoxes`' separate Days/Hours/Minutes/Seconds boxes, so both always agree on the same real numbers. */
export function splitCountdown(remainingMs: number): CountdownParts {
  const totalSeconds = Math.floor(remainingMs / 1000)
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  }
}

/** Formats a duration as "Xd Yh Zm Ws" (only the leading non-zero units down to a minimum of minutes/seconds), for the compact single-line countdown display. */
export function formatCountdown(remainingMs: number): string {
  const { days, hours, minutes, seconds } = splitCountdown(remainingMs)

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (days > 0 || hours > 0) parts.push(`${hours}h`)
  parts.push(`${minutes}m`)
  parts.push(`${seconds}s`)
  return parts.join(' ')
}
