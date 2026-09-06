import { render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicArtworkGrid } from './PublicArtworkGrid'
import type { Artwork } from '../types'

const usePublishedArtworks = vi.fn()
vi.mock('../hooks/usePublishedArtworks', () => ({
  usePublishedArtworks: (...args: unknown[]) => usePublishedArtworks(...args),
}))

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
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('PublicArtworkGrid', () => {
  it('queries by the given sellerId', () => {
    usePublishedArtworks.mockReturnValue({ status: 'loading' })
    render(<PublicArtworkGrid sellerId="alice" />)
    expect(usePublishedArtworks).toHaveBeenCalledWith('alice')
  })

  it('shows a loading state', () => {
    usePublishedArtworks.mockReturnValue({ status: 'loading' })
    render(<PublicArtworkGrid sellerId="alice" />)
    expect(screen.getByLabelText('Loading published artworks')).toBeInTheDocument()
  })

  it('shows an honest empty state when there are no published artworks', () => {
    usePublishedArtworks.mockReturnValue({ status: 'loaded', artworks: [] })
    render(<PublicArtworkGrid sellerId="alice" />)
    expect(screen.getByText('No public artworks yet')).toBeInTheDocument()
  })

  it('renders each real published artwork', () => {
    usePublishedArtworks.mockReturnValue({
      status: 'loaded',
      artworks: [buildArtwork({ id: 'a1', title: 'Sunset' }), buildArtwork({ id: 'a2', title: 'Sunrise' })],
    })
    render(<PublicArtworkGrid sellerId="alice" />)
    expect(screen.getByText('Sunset')).toBeInTheDocument()
    expect(screen.getByText('Sunrise')).toBeInTheDocument()
  })

  it('shows an error state on failure', () => {
    usePublishedArtworks.mockReturnValue({ status: 'error', error: { message: 'Network unavailable.' } })
    render(<PublicArtworkGrid sellerId="alice" />)
    expect(screen.getByText("Couldn't load this artist's artworks")).toBeInTheDocument()
  })
})
