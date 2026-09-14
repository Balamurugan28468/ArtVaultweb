import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CurrentBidPanel } from './CurrentBidPanel'
import type { Auction } from '../types'

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

function ts(ms: number) {
  return { toMillis: () => ms } as unknown as import('firebase/firestore').Timestamp
}

const BASE_AUCTION: Auction = {
  id: 'a1',
  artworkId: 'artwork-1',
  sellerId: 'seller-1',
  startAt: ts(1000),
  endAt: ts(2000),
  startingBid: 500000,
  bidIncrement: 10000,
  currentHighBid: null,
  bidCount: 0,
  winnerUid: null,
  winningBidAmount: null,
  createdAt: ts(0),
  updatedAt: ts(0),
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('CurrentBidPanel', () => {
  it('renders the bid input and Place Bid button disabled, with an honest not-connected message — never a working fake bid', () => {
    useAuth.mockReturnValue({ user: null })
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1500))
    render(<CurrentBidPanel auction={BASE_AUCTION} />)

    expect(screen.getByLabelText('Bid amount')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Place Bid' })).toBeDisabled()
    expect(screen.getByText(/Bidding isn't connected yet/)).toBeInTheDocument()
  })

  it('shows the minimum next bid as starting bid plus increment once a bid exists', () => {
    useAuth.mockReturnValue({ user: null })
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1500))
    render(<CurrentBidPanel auction={{ ...BASE_AUCTION, currentHighBid: 520000, bidCount: 2 }} />)

    expect(screen.getByText('Minimum next bid: ₹5300')).toBeInTheDocument()
  })

  it('shows an honest "no winning bid was recorded" message for an ended auction with no winner', () => {
    useAuth.mockReturnValue({ user: null })
    vi.useFakeTimers()
    vi.setSystemTime(new Date(5000))
    render(<CurrentBidPanel auction={BASE_AUCTION} />)

    expect(screen.getByText('Auction ended')).toBeInTheDocument()
    expect(screen.getByText('No winning bid was recorded for this auction.')).toBeInTheDocument()
  })

  it('shows a "You won this auction!" banner only when the signed-in user is the real recorded winner', () => {
    useAuth.mockReturnValue({ user: { uid: 'winner-1' } })
    vi.useFakeTimers()
    vi.setSystemTime(new Date(5000))
    render(<CurrentBidPanel auction={{ ...BASE_AUCTION, winnerUid: 'winner-1', winningBidAmount: 600000 }} />)

    expect(screen.getByText('You won this auction!')).toBeInTheDocument()
    expect(screen.getByText('₹6000')).toBeInTheDocument()
  })

  it('never shows a win banner for a different signed-in user than the recorded winner', () => {
    useAuth.mockReturnValue({ user: { uid: 'someone-else' } })
    vi.useFakeTimers()
    vi.setSystemTime(new Date(5000))
    render(<CurrentBidPanel auction={{ ...BASE_AUCTION, winnerUid: 'winner-1', winningBidAmount: 600000 }} />)

    expect(screen.queryByText('You won this auction!')).not.toBeInTheDocument()
  })
})
