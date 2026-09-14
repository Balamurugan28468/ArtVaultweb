import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuctionCountdownBoxes } from './AuctionCountdownBoxes'

function ts(ms: number) {
  return { toMillis: () => ms } as unknown as import('firebase/firestore').Timestamp
}

describe('AuctionCountdownBoxes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows real Days/Hours/Minutes/Seconds boxes computed from the real timestamps', () => {
    vi.setSystemTime(new Date(0))
    const oneDayTwoHours = 26 * 60 * 60 * 1000
    render(<AuctionCountdownBoxes auction={{ startAt: ts(0), endAt: ts(oneDayTwoHours) }} />)

    expect(screen.getByText('Ends in')).toBeInTheDocument()
    expect(screen.getByText('Days')).toBeInTheDocument()
    expect(screen.getByText('Hours')).toBeInTheDocument()
    expect(screen.getByText('Minutes')).toBeInTheDocument()
    expect(screen.getByText('Seconds')).toBeInTheDocument()
    expect(screen.getByText('01')).toBeInTheDocument() // 1 day
    expect(screen.getByText('02')).toBeInTheDocument() // 2 hours
  })

  it('shows "Starts in" before startAt', () => {
    vi.setSystemTime(new Date(0))
    render(<AuctionCountdownBoxes auction={{ startAt: ts(1000), endAt: ts(2000) }} />)
    expect(screen.getByText('Starts in')).toBeInTheDocument()
  })

  it('shows "Auction ended" after endAt — never a fabricated countdown', () => {
    vi.setSystemTime(new Date(5000))
    render(<AuctionCountdownBoxes auction={{ startAt: ts(1000), endAt: ts(2000) }} />)
    expect(screen.getByText('Auction ended')).toBeInTheDocument()
  })
})
