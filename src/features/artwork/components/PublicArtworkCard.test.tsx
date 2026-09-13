import { fireEvent, render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { MemoryRouter } from 'react-router'
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
    likeCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function renderCard(props: Parameters<typeof PublicArtworkCard>[0]) {
  return render(
    <MemoryRouter>
      <PublicArtworkCard {...props} />
    </MemoryRouter>,
  )
}

describe('PublicArtworkCard', () => {
  it('shows the title and whole-rupee price', () => {
    renderCard({ artwork: buildArtwork() })
    expect(screen.getByText('Sunset Over the Bay')).toBeInTheDocument()
    expect(screen.getByText('₹1500')).toBeInTheDocument()
  })

  it('shows the first image as the cover when present', () => {
    const artwork = buildArtwork({
      images: [{ id: 'img1.jpg', path: 'artworks/alice/a1/img1.jpg', url: 'https://example.test/img1.jpg', order: 0, contentType: 'image/jpeg', size: 100 }],
    })
    const { container } = renderCard({ artwork })
    // alt="" is deliberate (the title is already shown as an adjacent
    // heading — see the component) so this is role "presentation", not
    // "img", to a screen reader; queried by tag here rather than role.
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/img1.jpg')
  })

  it('falls back to the placeholder icon when the image fails to load', () => {
    const artwork = buildArtwork({
      images: [{ id: 'img1.jpg', path: 'artworks/alice/a1/img1.jpg', url: 'https://example.test/broken.jpg', order: 0, contentType: 'image/jpeg', size: 100 }],
    })
    const { container } = renderCard({ artwork })
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it('never renders an owner-only edit/delete/status-badge control — read-only by construction', () => {
    renderCard({ artwork: buildArtwork() })
    expect(screen.queryByRole('button', { name: /edit|delete|publish|reject/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/draft|submitted|rejected|published/i)).not.toBeInTheDocument()
  })

  it('always renders the Wishlist save control for the given artwork (Module 09) — never an opt-in prop', () => {
    renderCard({ artwork: buildArtwork({ id: 'a7' }) })
    expect(WishlistButton).toHaveBeenCalledWith(expect.objectContaining({ artworkId: 'a7' }))
  })

  it('shows the artist display name when one is passed (Module 08, Marketplace)', () => {
    renderCard({ artwork: buildArtwork(), artistDisplayName: 'Alice Fine Art' })
    expect(screen.getByText('Alice Fine Art')).toBeInTheDocument()
  })

  it('renders no artist name line at all when none is passed — unchanged from the artist page’s own usage', () => {
    renderCard({ artwork: buildArtwork() })
    expect(screen.queryByText('Alice Fine Art')).not.toBeInTheDocument()
  })

  it('renders no artist name line when explicitly null (e.g. the artist has no display name resolved yet)', () => {
    renderCard({ artwork: buildArtwork(), artistDisplayName: null })
    expect(screen.queryByText('Alice Fine Art')).not.toBeInTheDocument()
  })

  it('Module 11: the image and title both link to the artwork\'s own detail page', () => {
    renderCard({ artwork: buildArtwork({ id: 'a1' }) })
    const artworkLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('href') === '/artworks/a1')
    // One link wraps the image, a second wraps the title — both point at
    // the same destination, never the seller's page.
    expect(artworkLinks.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('link', { name: 'Sunset Over the Bay' })).toHaveAttribute('href', '/artworks/a1')
  })

  it('Module 11: the artist name links to the artist\'s own page, a different destination from the artwork', () => {
    renderCard({ artwork: buildArtwork({ id: 'a1', sellerId: 'alice' }), artistDisplayName: 'Alice Fine Art' })
    expect(screen.getByRole('link', { name: 'Alice Fine Art' })).toHaveAttribute('href', '/artists/alice')
  })

  // UI-01's AR+AI product-wide requirement — compact, honest, inert
  // indicators on every artwork card (real actions live on Artwork Detail).
  it('shows compact, honestly-disabled View in AR and AI Artwork Analysis indicators — never a working action here', () => {
    renderCard({ artwork: buildArtwork() })
    const arBadge = screen.getByTitle('View in AR — coming soon')
    const aiBadge = screen.getByTitle('AI Artwork Analysis — coming soon')
    expect(arBadge).toHaveAttribute('aria-disabled', 'true')
    expect(aiBadge).toHaveAttribute('aria-disabled', 'true')
  })

  it('Module 11: the wishlist control renders inside the artwork Link\'s DOM subtree, and still receives clicks normally', () => {
    // WishlistButton is mocked here, so its own preventDefault/
    // stopPropagation guard against the new wrapping <Link> isn't
    // exercised by this test — that's WishlistButton's own responsibility,
    // covered by its dedicated test file. This only proves the button is
    // still reachable and clickable now that it's nested one level deeper.
    renderCard({ artwork: buildArtwork({ id: 'a1' }) })
    fireEvent.click(screen.getByLabelText('Save to wishlist'))
    expect(WishlistButton).toHaveBeenCalledWith(expect.objectContaining({ artworkId: 'a1' }))
  })
})
