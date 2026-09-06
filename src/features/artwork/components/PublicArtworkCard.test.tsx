import { render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { PublicArtworkCard } from './PublicArtworkCard'
import type { Artwork } from '../types'

const now = Timestamp.now()

function buildArtwork(overrides: Partial<Artwork> = {}): Artwork {
  return {
    id: 'a1',
    sellerId: 'alice',
    title: 'Sunset Over the Bay',
    description: 'A painting.',
    price: 150000,
    category: 'painting',
    tags: [],
    images: [],
    inventoryCount: 3,
    status: 'PUBLISHED',
    reviewedAt: now,
    rejectionReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('PublicArtworkCard', () => {
  it('shows the title and whole-rupee price', () => {
    render(<PublicArtworkCard artwork={buildArtwork()} />)
    expect(screen.getByText('Sunset Over the Bay')).toBeInTheDocument()
    expect(screen.getByText('₹1500')).toBeInTheDocument()
  })

  it('shows the first image as the cover when present', () => {
    const artwork = buildArtwork({
      images: [{ id: 'img1.jpg', path: 'artworks/alice/a1/img1.jpg', url: 'https://example.test/img1.jpg', order: 0, contentType: 'image/jpeg', size: 100 }],
    })
    const { container } = render(<PublicArtworkCard artwork={artwork} />)
    // alt="" is deliberate (the title is already shown as an adjacent
    // heading — see the component) so this is role "presentation", not
    // "img", to a screen reader; queried by tag here rather than role.
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/img1.jpg')
  })

  it('never renders an edit/delete/status-badge control — read-only by construction', () => {
    render(<PublicArtworkCard artwork={buildArtwork()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText(/draft|submitted|rejected|published/i)).not.toBeInTheDocument()
  })
})
