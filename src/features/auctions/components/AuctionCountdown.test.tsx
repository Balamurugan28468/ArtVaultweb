import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuctionCountdown } from './AuctionCountdown'

function ts(ms: number) {
  return { toMillis: () => ms } as unknown as import('firebase/firestore').Timestamp
}

describe('AuctionCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows "Starts in" before startAt', () => {
    vi.setSystemTime(new Date(500))
    render(<AuctionCountdown auction={{ startAt: ts(1000), endAt: ts(2000) }} />)
    expect(screen.getByText(/Starts in/)).toBeInTheDocument()
  })

  it('shows "Ends in" between startAt and endAt', () => {
    vi.setSystemTime(new Date(1500))
    render(<AuctionCountdown auction={{ startAt: ts(1000), endAt: ts(2000) }} />)
    expect(screen.getByText(/Ends in/)).toBeInTheDocument()
  })

  it('shows "Auction ended" after endAt — never a fabricated countdown', () => {
    vi.setSystemTime(new Date(5000))
    render(<AuctionCountdown auction={{ startAt: ts(1000), endAt: ts(2000) }} />)
    expect(screen.getByText('Auction ended')).toBeInTheDocument()
  })
})
