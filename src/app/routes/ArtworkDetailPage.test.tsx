import { fireEvent, render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Artwork } from '@/features/artwork'

const usePublicArtwork = vi.fn()
const ArtworkGallery = vi.fn((props: { images: unknown[]; title: string }) => <div>gallery for {props.title}</div>)
vi.mock('@/features/artwork', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/artwork')>()
  return {
    ...actual,
    usePublicArtwork: (...args: unknown[]) => usePublicArtwork(...args),
    ArtworkGallery: (props: { images: unknown[]; title: string }) => ArtworkGallery(props),
  }
})

const useArtistDisplayNames = vi.fn((..._args: unknown[]) => ({}) as Record<string, string | null>)
vi.mock('@/features/marketplace', () => ({ useArtistDisplayNames: (...args: unknown[]) => useArtistDisplayNames(...args) }))

const WishlistButton = vi.fn((props: { artworkId: string }) => <button aria-label={`Save ${props.artworkId} to wishlist`}>heart</button>)
vi.mock('@/features/wishlist', () => ({ WishlistButton: (props: { artworkId: string }) => WishlistButton(props) }))

const LikeButton = vi.fn((props: { artworkId: string; likeCount: number }) => (
  <button aria-label={`Like ${props.artworkId}, ${props.likeCount} likes`}>star</button>
))
vi.mock('@/features/likes', () => ({ LikeButton: (props: { artworkId: string; likeCount: number }) => LikeButton(props) }))

const { ArtworkDetailPage } = await import('./ArtworkDetailPage')

function renderPage(artworkId = 'a1') {
  return render(
    <MemoryRouter initialEntries={[`/artworks/${artworkId}`]}>
      <Routes>
        <Route path="/artworks/:artworkId" element={<ArtworkDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const now = Timestamp.now()

function buildArtwork(overrides: Partial<Artwork> = {}): Artwork {
  return {
    id: 'a1',
    sellerId: 'alice',
    title: 'Sunset Over the Bay',
    description: 'A real, full description of the painting.',
    price: 150000,
    category: 'painting',
    tags: ['bay', 'evening'],
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

describe('ArtworkDetailPage', () => {
  it('shows a loading state while the artwork is being fetched', () => {
    usePublicArtwork.mockReturnValue({ status: 'pending' })
    renderPage()
    expect(screen.getByLabelText('Loading artwork')).toBeInTheDocument()
  })

  it('renders the real artwork once loaded — title, price, description, category, tags, artist, wishlist, share', () => {
    usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork({ likeCount: 4 }) })
    useArtistDisplayNames.mockReturnValue({ alice: 'Alice Fine Art' })
    renderPage()

    expect(screen.getByRole('heading', { name: 'Sunset Over the Bay', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('₹1500')).toBeInTheDocument()
    expect(screen.getByText('A real, full description of the painting.')).toBeInTheDocument()
    expect(screen.getByText('Painting')).toBeInTheDocument()
    expect(screen.getByText('bay')).toBeInTheDocument()
    expect(screen.getByText('evening')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Alice Fine Art/ })).toHaveAttribute('href', '/artists/alice')
    expect(screen.getByLabelText('Save a1 to wishlist')).toBeInTheDocument()
    expect(screen.getByLabelText('Like a1, 4 likes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share this artwork' })).toBeInTheDocument()
    expect(ArtworkGallery).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sunset Over the Bay' }))
    expect(LikeButton).toHaveBeenCalledWith(expect.objectContaining({ artworkId: 'a1', likeCount: 4 }))
  })

  it('renders with zero images without crashing (delegated to ArtworkGallery)', () => {
    usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork({ images: [] }) })
    renderPage()
    expect(ArtworkGallery).toHaveBeenCalledWith(expect.objectContaining({ images: [] }))
  })

  it('passes multiple images through to ArtworkGallery unchanged', () => {
    const images = [
      { id: '1', path: 'p1', url: 'https://example.test/1.jpg', order: 0, contentType: 'image/jpeg' as const, size: 1 },
      { id: '2', path: 'p2', url: 'https://example.test/2.jpg', order: 1, contentType: 'image/jpeg' as const, size: 1 },
    ]
    usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork({ images }) })
    renderPage()
    expect(ArtworkGallery).toHaveBeenCalledWith(expect.objectContaining({ images }))
  })

  it('handles a long title and a long description without omitting any of the real text', () => {
    const longTitle = 'A '.repeat(40) + 'Very Long Artwork Title'
    const longDescription = 'This is a genuinely long description. '.repeat(20)
    usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork({ title: longTitle, description: longDescription }) })
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(longTitle)
    expect(screen.getByText(longDescription.trim(), { exact: false })).toBeInTheDocument()
  })

  it('renders no artist link when no display name resolves — never a broken/empty link', () => {
    usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
    useArtistDisplayNames.mockReturnValue({ alice: null })
    renderPage()
    expect(screen.queryByRole('link', { name: /Alice/ })).not.toBeInTheDocument()
  })

  it('shows an honest, generic not-found state for a nonexistent or private artwork — never distinguishing the two', () => {
    usePublicArtwork.mockReturnValue({ status: 'success', data: null })
    renderPage('does-not-exist')
    expect(screen.getByText('Artwork not found')).toBeInTheDocument()
  })

  it('shows an error state with a retry action on a genuine failure', () => {
    const refetch = vi.fn()
    usePublicArtwork.mockReturnValue({ status: 'error', error: { code: 'network', message: 'Network unavailable.' }, refetch })
    renderPage()
    expect(screen.getByText("Couldn't load this artwork")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('never renders any fabricated content — no reviews, ratings, stock urgency, delivery estimate, or Buy Now control', () => {
    usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
    renderPage()
    expect(screen.queryByText(/review|rating|only \d+ left|delivery|buy now|add to cart/i)).not.toBeInTheDocument()
  })
})
