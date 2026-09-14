import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { Timestamp } from 'firebase/firestore'
import { describe, expect, it, vi } from 'vitest'
import type { Auction } from '@/features/auctions'
import type { Artwork } from '@/features/artwork'

const useAuction = vi.fn()
const useAuctions = vi.fn((): { status: 'loaded'; auctions: Auction[] } => ({ status: 'loaded', auctions: [] }))
vi.mock('@/features/auctions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auctions')>()
  return { ...actual, useAuction: () => useAuction(), useAuctions: () => useAuctions() }
})

const useArtistDisplayNames = vi.fn((_ids: string[]) => ({}))
vi.mock('@/features/marketplace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/marketplace')>()
  return { ...actual, useArtistDisplayNames: (ids: string[]) => useArtistDisplayNames(ids) }
})

const useArtistProfile = vi.fn((..._args: unknown[]) => ({ status: 'loading' }) as { status: string; profile?: { bio: string } })
vi.mock('@/features/artist-profile', () => ({ useArtistProfile: (...args: unknown[]) => useArtistProfile(...args) }))

// Rendered outside a real WishlistProvider — same stub ArtworkDetailPage.test.tsx already uses.
vi.mock('@/features/wishlist', () => ({ WishlistButton: () => null }))
const LikeButton = vi.fn((props: { artworkId: string; likeCount: number }) => (
  <button aria-label={`Like ${props.artworkId}, ${props.likeCount} likes`}>star</button>
))
vi.mock('@/features/likes', () => ({ LikeButton: (props: { artworkId: string; likeCount: number }) => LikeButton(props) }))

const useAuth = vi.fn(() => ({ user: null }))
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

const { AuctionDetailPage } = await import('./AuctionDetailPage')

function ts(ms: number) {
  return Timestamp.fromMillis(ms)
}

const BASE_AUCTION: Auction = {
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
}

const BASE_ARTWORK = {
  id: 'artwork-1',
  sellerId: 'seller-1',
  title: 'Starry Reflections',
  description: 'A night sky in oil.',
  images: [],
} as unknown as Artwork

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/auctions/a1']}>
      <Routes>
        <Route path="/auctions/:auctionId" element={<AuctionDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AuctionDetailPage', () => {
  it('shows a loading state', () => {
    useAuction.mockReturnValue({ status: 'loading' })
    renderPage()
    expect(screen.getByLabelText('Loading auction')).toBeInTheDocument()
  })

  it('shows an honest "Auction not found" state — never a fabricated auction', () => {
    useAuction.mockReturnValue({ status: 'missing' })
    renderPage()
    expect(screen.getByText('Auction not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Auctions' })).toHaveAttribute('href', '/auctions')
  })

  it('shows an error state, distinct from missing', () => {
    useAuction.mockReturnValue({ status: 'error', error: { code: 'unknown', message: 'boom' } })
    renderPage()
    expect(screen.getByText("Couldn't load this auction")).toBeInTheDocument()
  })

  it('renders the real linked artwork title, description, and auction timing/bid details', () => {
    useAuction.mockReturnValue({ status: 'loaded', auction: BASE_AUCTION, artwork: BASE_ARTWORK })
    renderPage()

    expect(screen.getByRole('heading', { name: 'Starry Reflections' })).toBeInTheDocument()
    expect(screen.getByText('A night sky in oil.')).toBeInTheDocument()
    // ₹5000 (the starting bid) appears both in the Auction Details card and
    // in CurrentBidPanel's own "current bid" display — both real, same value.
    expect(screen.getAllByText('₹5000').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('₹100')).toBeInTheDocument() // bid increment
    expect(screen.getByRole('link', { name: 'View full artwork listing →' })).toHaveAttribute('href', '/artworks/artwork-1')
  })

  it('shows an honest placeholder when the linked artwork is unavailable', () => {
    useAuction.mockReturnValue({ status: 'loaded', auction: BASE_AUCTION, artwork: null })
    renderPage()
    expect(screen.getAllByText('Artwork unavailable').length).toBeGreaterThan(0)
  })

  it('renders the bid history panel as honestly not connected, labeled "Live Bidding" for a real LIVE auction', () => {
    useAuction.mockReturnValue({ status: 'loaded', auction: BASE_AUCTION, artwork: BASE_ARTWORK })
    renderPage()
    // Appears twice: the always-visible sidebar panel, and the (hidden by
    // default) Bidding History tab panel — both real, same honest content.
    expect(screen.getAllByText("Live Bidding isn't connected yet").length).toBe(2)
  })

  it('shows real auction detail fields (Final bid, Status) in the Details tab', () => {
    useAuction.mockReturnValue({
      status: 'loaded',
      auction: { ...BASE_AUCTION, endAt: ts(Date.now() - 1000), winnerUid: 'winner-1', winningBidAmount: 2840000 },
      artwork: BASE_ARTWORK,
    })
    renderPage()
    // ₹28400 (the winning bid) appears both in CurrentBidPanel's "Winning
    // bid" line and the Details tab's "Final bid" row — both real, same value.
    expect(screen.getAllByText('₹28400').length).toBeGreaterThanOrEqual(2)
    // "Ended" appears both on the status badge and in the Details tab's
    // Status row — both real, same derived value.
    expect(screen.getAllByText('Ended').length).toBeGreaterThanOrEqual(2)
  })

  it('shows the info tabs and switches to the Shipping tab on click', () => {
    useAuction.mockReturnValue({ status: 'loaded', auction: BASE_AUCTION, artwork: BASE_ARTWORK })
    renderPage()

    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'Shipping' }))
    expect(screen.getByText(/Shipping and returns aren't connected yet/)).toBeVisible()
  })

  describe('completed (ENDED) result page', () => {
    const ENDED_AUCTION: Auction = { ...BASE_AUCTION, endAt: ts(Date.now() - 1000) }

    it('renders a dedicated "Auction Ended" result composition, honest about no recorded winner', () => {
      useAuction.mockReturnValue({ status: 'loaded', auction: ENDED_AUCTION, artwork: BASE_ARTWORK })
      renderPage()

      expect(screen.getByText('Auction Ended')).toBeInTheDocument()
      expect(screen.getByText('This auction has closed.')).toBeInTheDocument()
      expect(screen.getByText('No winning bid was recorded for this auction.')).toBeInTheDocument()
      expect(screen.queryByText('Congratulations to the winner!')).not.toBeInTheDocument()
    })

    it('shows real winner congratulations copy only when winnerUid actually exists', () => {
      useAuction.mockReturnValue({
        status: 'loaded',
        auction: { ...ENDED_AUCTION, winnerUid: 'winner-1', winningBidAmount: 2840000 },
        artwork: BASE_ARTWORK,
      })
      renderPage()

      expect(screen.getByText('Congratulations to the winner!')).toBeInTheDocument()
      expect(screen.getAllByText('₹28400').length).toBeGreaterThanOrEqual(1)
    })

    it('shows the honest "Bid ranking unavailable" panel — never a fabricated leaderboard', () => {
      useAuction.mockReturnValue({ status: 'loaded', auction: ENDED_AUCTION, artwork: BASE_ARTWORK })
      renderPage()
      expect(screen.getByText('Bid ranking unavailable')).toBeInTheDocument()
    })

    it('shows the "What\'s Next?" card linking back to Auctions', () => {
      useAuction.mockReturnValue({ status: 'loaded', auction: ENDED_AUCTION, artwork: BASE_ARTWORK })
      renderPage()
      expect(screen.getByRole('link', { name: 'View Upcoming Auctions →' })).toHaveAttribute('href', '/auctions')
    })

    it('shows "View Next Auction" only when a real other SCHEDULED auction exists', () => {
      useAuction.mockReturnValue({ status: 'loaded', auction: ENDED_AUCTION, artwork: BASE_ARTWORK })
      useAuctions.mockReturnValue({
        status: 'loaded',
        auctions: [{ ...BASE_AUCTION, id: 'next-1', startAt: ts(Date.now() + 60_000), endAt: ts(Date.now() + 120_000) }],
      })
      renderPage()
      expect(screen.getByRole('link', { name: 'View Next Auction →' })).toHaveAttribute('href', '/auctions/next-1')
    })

    it('never shows "View Next Auction" when no real upcoming auction exists — no fabricated link', () => {
      useAuction.mockReturnValue({ status: 'loaded', auction: ENDED_AUCTION, artwork: BASE_ARTWORK })
      useAuctions.mockReturnValue({ status: 'loaded', auctions: [] })
      renderPage()
      expect(screen.queryByRole('link', { name: 'View Next Auction →' })).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Explore More Artworks' })).toHaveAttribute('href', '/explore')
    })
  })
})
