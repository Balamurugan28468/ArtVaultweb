import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Artwork } from '@/features/artwork'
import { AuctionCard } from './AuctionCard'
import type { Auction } from '../types'

// Same stub ArtworkDetailPage.test.tsx/PublicArtworkCard.test.tsx already
// use for a card rendered outside a real WishlistProvider — this file's
// concern is AuctionCard's own wiring, not WishlistButton's internals.
vi.mock('@/features/wishlist/components/WishlistButton', () => ({ WishlistButton: () => null }))

function ts(ms: number) {
  return { toMillis: () => ms } as unknown as import('firebase/firestore').Timestamp
}

const BASE_AUCTION: Auction = {
  id: 'a1',
  artworkId: 'artwork-1',
  sellerId: 'seller-1',
  startAt: ts(1000),
  endAt: ts(2_000_000_000_000),
  startingBid: 500000,
  bidIncrement: 10000,
  currentHighBid: null,
  bidCount: 0,
  winnerUid: null,
  winningBidAmount: null,
  createdAt: ts(0),
  updatedAt: ts(0),
}

const BASE_ARTWORK = { id: 'artwork-1', title: 'Starry Reflections', images: [] } as unknown as Artwork

function renderCard(props: Partial<Parameters<typeof AuctionCard>[0]> = {}) {
  return render(
    <MemoryRouter>
      <AuctionCard auction={BASE_AUCTION} artwork={BASE_ARTWORK} {...props} />
    </MemoryRouter>,
  )
}

describe('AuctionCard', () => {
  it('links to the auction detail page, not the artwork page', () => {
    renderCard()
    expect(screen.getByRole('link', { name: /Starry Reflections/ })).toHaveAttribute('href', '/auctions/a1')
  })

  it('shows the starting bid before any real bid exists — never a fabricated current bid', () => {
    renderCard()
    expect(screen.getByText('Starting bid')).toBeInTheDocument()
    expect(screen.getByText('₹5000')).toBeInTheDocument()
  })

  it('shows the real current bid once one exists', () => {
    renderCard({ auction: { ...BASE_AUCTION, currentHighBid: 520000, bidCount: 3 } })
    expect(screen.getByText('Current bid')).toBeInTheDocument()
    expect(screen.getByText('₹5200')).toBeInTheDocument()
  })

  it('shows an honest placeholder when the linked artwork is unavailable', () => {
    renderCard({ artwork: null })
    expect(screen.getByText('Artwork unavailable')).toBeInTheDocument()
  })

  it('shows AR/AI as honestly disabled, never a working link — same convention as PublicArtworkCard', () => {
    renderCard()
    expect(screen.getByTitle('AR preview unavailable')).toHaveAttribute('role', 'img')
    expect(screen.getByTitle('AI Artwork Analysis — coming soon')).toHaveAttribute('aria-disabled', 'true')
  })
})
