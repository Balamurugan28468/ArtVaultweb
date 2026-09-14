import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Timestamp } from 'firebase/firestore'
import { describe, expect, it, vi } from 'vitest'
import type { Auction } from '@/features/auctions'

const useAuctions = vi.fn()
const useAuctionArtworks = vi.fn((_ids: string[]) => ({}))
vi.mock('@/features/auctions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auctions')>()
  return { ...actual, useAuctions: () => useAuctions(), useAuctionArtworks: (ids: string[]) => useAuctionArtworks(ids) }
})

const useArtistDisplayNames = vi.fn((_ids: string[]) => ({}))
vi.mock('@/features/marketplace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/marketplace')>()
  return { ...actual, useArtistDisplayNames: (ids: string[]) => useArtistDisplayNames(ids) }
})

const { AuctionsPage } = await import('./AuctionsPage')

function ts(ms: number) {
  return Timestamp.fromMillis(ms)
}

function buildAuction(overrides: Partial<Auction> = {}): Auction {
  return {
    id: 'a1',
    artworkId: 'artwork-1',
    sellerId: 'seller-1',
    startAt: ts(Date.now() - 60_000),
    endAt: ts(Date.now() + 60_000),
    startingBid: 500000,
    bidIncrement: 10000,
    currentHighBid: null,
    bidCount: 0,
    winnerUid: null,
    winningBidAmount: null,
    createdAt: ts(0),
    updatedAt: ts(0),
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AuctionsPage />
    </MemoryRouter>,
  )
}

describe('AuctionsPage', () => {
  it('shows a loading state', () => {
    useAuctions.mockReturnValue({ status: 'loading' })
    renderPage()
    expect(screen.getByLabelText('Loading auctions')).toBeInTheDocument()
  })

  it('shows an error state, distinct from empty', () => {
    useAuctions.mockReturnValue({ status: 'error', error: { code: 'unknown', message: 'boom' } })
    renderPage()
    expect(screen.getByText("Couldn't load auctions")).toBeInTheDocument()
  })

  it('defaults to the Upcoming tab and shows an honest empty state when nothing is scheduled — never a fabricated auction', () => {
    useAuctions.mockReturnValue({ status: 'loaded', auctions: [] })
    renderPage()
    expect(screen.getByText('No upcoming auctions')).toBeInTheDocument()
  })

  it('buckets a live auction under Live Now with the real count in the tab label', () => {
    useAuctions.mockReturnValue({ status: 'loaded', auctions: [buildAuction()] })
    renderPage()

    expect(screen.getByRole('tab', { name: 'Live Now (1)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Live Now (1)' }))
    expect(screen.getByRole('link', { name: /Artwork unavailable/ })).toHaveAttribute('href', '/auctions/a1')
  })

  it('buckets a scheduled auction under Upcoming, not Live', () => {
    useAuctions.mockReturnValue({
      status: 'loaded',
      auctions: [buildAuction({ startAt: ts(Date.now() + 60_000), endAt: ts(Date.now() + 120_000) })],
    })
    renderPage()

    expect(screen.getByRole('link', { name: /Artwork unavailable/ })).toHaveAttribute('href', '/auctions/a1')
    expect(screen.getByRole('tab', { name: 'Live Now (0)' })).toBeInTheDocument()
  })

  it('buckets an ended auction under Past Auctions', () => {
    useAuctions.mockReturnValue({
      status: 'loaded',
      auctions: [buildAuction({ startAt: ts(Date.now() - 120_000), endAt: ts(Date.now() - 60_000) })],
    })
    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Past Auctions' }))
    expect(screen.getByRole('link', { name: /Artwork unavailable/ })).toHaveAttribute('href', '/auctions/a1')
  })

  it('shows a real "Next Auction Starts In" hero countdown when a real upcoming auction exists', () => {
    useAuctions.mockReturnValue({
      status: 'loaded',
      auctions: [buildAuction({ id: 'next-auction', startAt: ts(Date.now() + 60_000), endAt: ts(Date.now() + 120_000) })],
    })
    renderPage()

    expect(screen.getByText('Next Auction Starts In')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View Upcoming Auction →' })).toHaveAttribute('href', '/auctions/next-auction')
  })

  it('never shows the hero countdown when no real upcoming auction exists — no fabricated "next auction"', () => {
    useAuctions.mockReturnValue({ status: 'loaded', auctions: [] })
    renderPage()
    expect(screen.queryByText('Next Auction Starts In')).not.toBeInTheDocument()
  })

  it('shows the honest, not-connected AI entry points — never a working assistant', () => {
    useAuctions.mockReturnValue({ status: 'loaded', auctions: [] })
    renderPage()

    expect(screen.getByText('Curated with AI')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
    expect(screen.getByText(/AI-powered auction insights aren't connected yet/)).toBeInTheDocument()
  })
})
