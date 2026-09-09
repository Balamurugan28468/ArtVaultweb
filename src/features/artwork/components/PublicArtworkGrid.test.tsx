import { render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicArtworkGrid } from './PublicArtworkGrid'
import type { Artwork } from '../types'

const usePublishedArtworks = vi.fn()
vi.mock('../hooks/usePublishedArtworks', () => ({
  usePublishedArtworks: (...args: unknown[]) => usePublishedArtworks(...args),
}))
vi.mock('@/features/wishlist/components/WishlistButton', () => ({ WishlistButton: () => null }))

beforeEach(() => {
  usePublishedArtworks.mockReset()
})

const now = Timestamp.now()

function buildArtwork(overrides: Partial<Artwork> = {}): Artwork {
  return {
    id: 'a1',
    sellerId: 'alice',
    title: 'Sunset',
    description: 'A painting.',
    price: 150000,
    category: 'painting',
    tags: [],
    images: [],
    inventoryCount: 1,
    status: 'PUBLISHED',
    reviewedAt: now,
    rejectionReason: null,
    likeCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function renderGrid(sellerId = 'alice') {
  return render(
    <MemoryRouter>
      <PublicArtworkGrid sellerId={sellerId} />
    </MemoryRouter>,
  )
}

describe('PublicArtworkGrid', () => {
  it('queries by the given sellerId', () => {
    usePublishedArtworks.mockReturnValue({ status: 'loading' })
    renderGrid('alice')
    expect(usePublishedArtworks).toHaveBeenCalledWith('alice')
  })

  it('shows a loading state', () => {
    usePublishedArtworks.mockReturnValue({ status: 'loading' })
    renderGrid()
    expect(screen.getByLabelText('Loading published artworks')).toBeInTheDocument()
  })

  it('shows an honest empty state when there are no published artworks', () => {
    usePublishedArtworks.mockReturnValue({ status: 'loaded', artworks: [] })
    renderGrid()
    expect(screen.getByText('No public artworks yet')).toBeInTheDocument()
  })

  it('renders each real published artwork', () => {
    usePublishedArtworks.mockReturnValue({
      status: 'loaded',
      artworks: [buildArtwork({ id: 'a1', title: 'Sunset' }), buildArtwork({ id: 'a2', title: 'Sunrise' })],
    })
    renderGrid()
    expect(screen.getByText('Sunset')).toBeInTheDocument()
    expect(screen.getByText('Sunrise')).toBeInTheDocument()
  })

  it('shows an error state on failure', () => {
    usePublishedArtworks.mockReturnValue({ status: 'error', error: { message: 'Network unavailable.' } })
    renderGrid()
    expect(screen.getByText("Couldn't load this artist's artworks")).toBeInTheDocument()
  })
})
