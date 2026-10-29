import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminAuctionsView } from './AdminAuctionsView'
import type { AdminAuctionRow } from '@/features/auctions'

const mockFetchAdminAuctions = vi.fn()
const mockScheduleAuctionLot = vi.fn()
const mockActivateAuction = vi.fn()
const mockCancelAuction = vi.fn()
const mockGetAllArtworks = vi.fn()

vi.mock('@/features/auctions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/auctions')>()),
  fetchAdminAuctions: () => mockFetchAdminAuctions(),
  scheduleAuctionLot: (...args: unknown[]) => mockScheduleAuctionLot(...args),
  activateAuction: (...args: unknown[]) => mockActivateAuction(...args),
  cancelAuction: (...args: unknown[]) => mockCancelAuction(...args),
}))

vi.mock('@/features/admin/api/adminQueueRepository', () => ({
  getAllArtworks: () => mockGetAllArtworks(),
}))

function ts(iso: string) {
  return { toDate: () => new Date(iso) } as unknown as import('@/lib/supabase/timestamp').Timestamp
}

const SAMPLE_AUCTION: AdminAuctionRow = {
  auctionId: 'auc-1',
  auctionItemId: 'lot-1',
  artworkId: 'art-12345678',
  sellerId: 'seller-1',
  startsAt: ts('2026-06-01T10:00:00Z'),
  endsAt: ts('2026-06-02T10:00:00Z'),
  auctionStatus: 'SCHEDULED',
  lotStatus: 'OPEN',
  startingBidMinor: 100000,
  bidIncrementMinor: 10000,
  currentHighBid: 0,
  bidCount: 0,
  winnerBidderId: null,
  winningBidMinor: null,
  paymentWindowExpiresAt: null,
  winnerOrderId: null,
  createdAt: ts('2026-05-30T10:00:00Z'),
  updatedAt: ts('2026-05-30T10:00:00Z'),
}

beforeEach(() => {
  mockFetchAdminAuctions.mockReset()
  mockScheduleAuctionLot.mockReset()
  mockActivateAuction.mockReset()
  mockCancelAuction.mockReset()
  mockGetAllArtworks.mockReset()

  mockGetAllArtworks.mockResolvedValue([
    {
      id: 'art-12345678',
      title: 'Ocean Breeze',
      price_minor: 150000,
      status: 'PUBLISHED',
      inventory_count: 3,
    },
  ])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AdminAuctionsView', () => {
  it('renders empty state when no auctions are scheduled', async () => {
    mockFetchAdminAuctions.mockResolvedValueOnce([])
    render(<AdminAuctionsView />)

    expect(await screen.findByText('Weekly Auction Engine')).toBeInTheDocument()
    expect(screen.getByText('No auctions found')).toBeInTheDocument()
  }, 15000)

  it('renders auction lots table with action buttons', async () => {
    mockFetchAdminAuctions.mockResolvedValueOnce([SAMPLE_AUCTION])
    render(<AdminAuctionsView />)

    expect(await screen.findByText(/art-1234/)).toBeInTheDocument()
    expect(screen.getByText('SCHEDULED')).toBeInTheDocument()
    expect(screen.getByText('OPEN')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Activate/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View Listing' })).toHaveAttribute('href', '/auctions/auc-1?lot=lot-1')
  }, 15000)

  it('calls activateAuction when clicking Activate button', async () => {
    mockFetchAdminAuctions.mockResolvedValue([SAMPLE_AUCTION])
    mockActivateAuction.mockResolvedValueOnce(undefined)

    render(<AdminAuctionsView />)

    const activateBtn = await screen.findByRole('button', { name: /Activate/i })
    fireEvent.click(activateBtn)

    await waitFor(() => {
      expect(mockActivateAuction).toHaveBeenCalledWith('auc-1')
    })
  }, 15000)

  it('calls cancelAuction when clicking Cancel button', async () => {
    mockFetchAdminAuctions.mockResolvedValue([SAMPLE_AUCTION])
    mockCancelAuction.mockResolvedValueOnce(undefined)

    render(<AdminAuctionsView />)

    const cancelBtn = await screen.findByRole('button', { name: /Cancel/i })
    fireEvent.click(cancelBtn)

    await waitFor(() => {
      expect(mockCancelAuction).toHaveBeenCalledWith('auc-1', expect.any(String))
    })
  }, 15000)

  it('opens modal and submits new auction schedule', async () => {
    mockFetchAdminAuctions.mockResolvedValue([SAMPLE_AUCTION])
    mockScheduleAuctionLot.mockResolvedValueOnce('new-lot-id')

    render(<AdminAuctionsView />)

    const openBtn = await screen.findByRole('button', { name: /Schedule Auction Lot/i })
    fireEvent.click(openBtn)

    expect(screen.getByText('Schedule Weekly Auction Lot')).toBeInTheDocument()

    // Fill form
    const select = screen.getByLabelText(/Select Published Artwork/i)
    fireEvent.change(select, { target: { value: 'art-12345678' } })

    const startsInput = screen.getByLabelText(/Starts At/i)
    const endsInput = screen.getByLabelText(/Ends At/i)
    fireEvent.change(startsInput, { target: { value: '2026-07-01T10:00' } })
    fireEvent.change(endsInput, { target: { value: '2026-07-02T10:00' } })

    const submitBtn = screen.getByRole('button', { name: 'Schedule Auction' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockScheduleAuctionLot).toHaveBeenCalledWith(
        expect.objectContaining({
          artworkId: 'art-12345678',
        })
      )
    })
  }, 15000)
})

