import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CurrentBidPanel } from './CurrentBidPanel'
import type { Auction } from '../types'
import { MemoryRouter } from 'react-router'

vi.mock('@/features/checkout', () => ({
  AddressPicker: ({ onSelectionChange }: { onSelectionChange?: (id: string | null) => void }) =>
    <button type="button" onClick={() => onSelectionChange?.('saved-address-1')}>Select saved shipping address</button>,
}))

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

const mockPlaceBid = vi.fn()
const mockCreateAuctionWinnerOrder = vi.fn()

vi.mock('../api/auctionsRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/auctionsRepository')>()),
  placeBid: (...args: unknown[]) => mockPlaceBid(...args),
  createAuctionWinnerOrder: (...args: unknown[]) => mockCreateAuctionWinnerOrder(...args),
}))

function ts(ms: number) {
  return { toMillis: () => ms } as unknown as import('@/lib/supabase/timestamp').Timestamp
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
  isWinner: false,
  winningBidAmount: null,
  createdAt: ts(0),
  updatedAt: ts(0),
}

beforeEach(() => {
  mockPlaceBid.mockReset()
  mockCreateAuctionWinnerOrder.mockReset()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign: vi.fn(), href: '' },
  })
})

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
  }, 15000)

  it('shows the minimum next bid as starting bid plus increment once a bid exists', () => {
    useAuth.mockReturnValue({ user: null })
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1500))
    render(<CurrentBidPanel auction={{ ...BASE_AUCTION, currentHighBid: 520000, bidCount: 2 }} />)

    expect(screen.getByText('Minimum next bid: ₹5,300')).toBeInTheDocument()
  }, 15000)

  it('shows an honest "no winning bid was recorded" message for an ended auction with no winner', () => {
    useAuth.mockReturnValue({ user: null })
    vi.useFakeTimers()
    vi.setSystemTime(new Date(5000))
    render(<CurrentBidPanel auction={BASE_AUCTION} />)

    expect(screen.getByText('Auction ended')).toBeInTheDocument()
    expect(screen.getByText('No winning bid was recorded for this auction.')).toBeInTheDocument()
  }, 15000)

  it('shows a "You won this auction!" banner only when the signed-in user is the real recorded winner', () => {
    useAuth.mockReturnValue({ user: { uid: 'winner-1' } })
    vi.useFakeTimers()
    vi.setSystemTime(new Date(5000))
    render(<CurrentBidPanel auction={{ ...BASE_AUCTION, isWinner: true, winningBidAmount: 600000 }} />)

    expect(screen.getByText('You won this auction!')).toBeInTheDocument()
    expect(screen.getByText('₹6,000')).toBeInTheDocument()
  }, 15000)

  it('never shows a win banner for a different signed-in user than the recorded winner', () => {
    useAuth.mockReturnValue({ user: { uid: 'someone-else' } })
    vi.useFakeTimers()
    vi.setSystemTime(new Date(5000))
    render(<CurrentBidPanel auction={{ ...BASE_AUCTION, isWinner: false, winningBidAmount: 600000 }} />)

    expect(screen.queryByText('You won this auction!')).not.toBeInTheDocument()
  }, 15000)

  describe('Module 5 connected live bidding', () => {
    const now = Date.now()
    const LIVE_LOT_AUCTION: Auction = {
      ...BASE_AUCTION,
      auctionItemId: 'lot-1',
      startAt: ts(now - 10000),
      endAt: ts(now + 100000),
      startingBid: 100000,
      bidIncrement: 10000,
      currentHighBid: 120000,
      bidCount: 2,
    }

    it('shows seller advisory when the logged in user is the seller', () => {
      useAuth.mockReturnValue({ user: { uid: 'seller-1' } })
      render(<CurrentBidPanel auction={LIVE_LOT_AUCTION} />)

      expect(screen.getByText(/You are the seller of this artwork/)).toBeInTheDocument()
    }, 15000)

    it('shows enabled inputs and handles place bid for authenticated buyer', async () => {
      useAuth.mockReturnValue({ user: { uid: 'buyer-1' } })
      mockPlaceBid.mockResolvedValueOnce({ success: true })

      const onBidPlaced = vi.fn()
      render(<CurrentBidPanel auction={LIVE_LOT_AUCTION} onBidPlaced={onBidPlaced} />)

      const input = screen.getByLabelText(/Bid amount in rupees/)
      expect(input).not.toBeDisabled()

      fireEvent.change(input, { target: { value: '1400' } })
      const submitBtn = screen.getByRole('button', { name: 'Place Bid' })
      expect(submitBtn).not.toBeDisabled()

      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockPlaceBid).toHaveBeenCalledWith('lot-1', 140000)
        expect(onBidPlaced).toHaveBeenCalled()
      })
    }, 15000)

    it('renders Proceed to Winner Checkout button for WINNER_PENDING winner', async () => {
      useAuth.mockReturnValue({ user: { uid: 'winner-1' } })
      mockCreateAuctionWinnerOrder.mockResolvedValueOnce('order-winner-1')

      render(
        <MemoryRouter>
        <CurrentBidPanel
          auction={{
            ...LIVE_LOT_AUCTION,
            lotStatus: 'WINNER_PENDING',
            isWinner: true,
            winningBidAmount: 150000,
          }}
        />
        </MemoryRouter>
      )

      const checkoutBtn = screen.getByRole('button', { name: /Proceed to Winner Checkout/ })
      expect(checkoutBtn).toBeInTheDocument()
      expect(checkoutBtn).toBeDisabled()
      fireEvent.click(checkoutBtn)
      expect(mockCreateAuctionWinnerOrder).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Select saved shipping address' }))
      expect(checkoutBtn).toBeEnabled()

      fireEvent.click(checkoutBtn)
      await waitFor(() => {
        expect(mockCreateAuctionWinnerOrder).toHaveBeenCalledWith('lot-1', 'saved-address-1')
        expect(window.location.assign).toHaveBeenCalledWith('/orders/order-winner-1')
      })
    }, 15000)
  })
})

it('keeps a failed winner checkout retryable and recovers the same order route on retry', async () => {
  useAuth.mockReturnValue({ user: { uid: 'winner-1' } })
  mockCreateAuctionWinnerOrder.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce('same-order')
  render(<MemoryRouter><CurrentBidPanel auction={{ ...BASE_AUCTION, auctionItemId: 'lot-1', lotStatus: 'WINNER_PENDING', isWinner: true }} /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Select saved shipping address' }))
  fireEvent.click(screen.getByRole('button', { name: /Proceed to Winner Checkout/ }))
  expect(await screen.findByText('Network unavailable')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Proceed to Winner Checkout/ }))
  await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith('/orders/same-order'))
  expect(mockCreateAuctionWinnerOrder).toHaveBeenCalledTimes(2)
})
