import { fireEvent, render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { describe, expect, it, vi } from 'vitest'
import { PublicArtworkCard } from './PublicArtworkCard'
import type { Artwork } from '../types'

const WishlistButton = vi.fn((props: { artworkId: string; className?: string }) => (
  <button aria-label="Save to wishlist">heart-{props.artworkId}</button>
))
vi.mock('@/features/wishlist/components/WishlistButton', () => ({
  WishlistButton: (props: { artworkId: string; className?: string }) => WishlistButton(props),
}))

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

  it('falls back to the placeholder icon when the image fails to load', () => {
    const artwork = buildArtwork({
      images: [{ id: 'img1.jpg', path: 'artworks/alice/a1/img1.jpg', url: 'https://example.test/broken.jpg', order: 0, contentType: 'image/jpeg', size: 100 }],
    })
    const { container } = render(<PublicArtworkCard artwork={artwork} />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it('never renders an owner-only edit/delete/status-badge control — read-only by construction', () => {
    render(<PublicArtworkCard artwork={buildArtwork()} />)
    expect(screen.queryByRole('button', { name: /edit|delete|publish|reject/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/draft|submitted|rejected|published/i)).not.toBeInTheDocument()
  })

  it('always renders the Wishlist save control for the given artwork (Module 09) — never an opt-in prop', () => {
    render(<PublicArtworkCard artwork={buildArtwork({ id: 'a7' })} />)
    expect(WishlistButton).toHaveBeenCalledWith(expect.objectContaining({ artworkId: 'a7' }))
  })

  it('shows the artist display name when one is passed (Module 08, Marketplace)', () => {
    render(<PublicArtworkCard artwork={buildArtwork()} artistDisplayName="Alice Fine Art" />)
    expect(screen.getByText('Alice Fine Art')).toBeInTheDocument()
  })

  it('renders no artist name line at all when none is passed — unchanged from the artist page’s own usage', () => {
    const { container } = render(<PublicArtworkCard artwork={buildArtwork()} />)
    expect(container.querySelectorAll('p')).toHaveLength(1)
  })

  it('renders no artist name line when explicitly null (e.g. the artist has no display name resolved yet)', () => {
    render(<PublicArtworkCard artwork={buildArtwork()} artistDisplayName={null} />)
    expect(screen.queryByText('Alice Fine Art')).not.toBeInTheDocument()
  })
})
