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
const useRelatedArtworks = vi.fn((..._args: unknown[]) => ({ status: 'success', artworks: [] as unknown[] }))
vi.mock('@/features/marketplace', () => ({
  useArtistDisplayNames: (...args: unknown[]) => useArtistDisplayNames(...args),
  useRelatedArtworks: (...args: unknown[]) => useRelatedArtworks(...args),
}))

const useArtistProfile = vi.fn((..._args: unknown[]) => ({ status: 'loading' }) as { status: string; profile?: { bio: string } })
vi.mock('@/features/artist-profile', () => ({ useArtistProfile: (...args: unknown[]) => useArtistProfile(...args) }))

const WishlistButton = vi.fn((props: { artworkId: string }) => <button aria-label={`Save ${props.artworkId} to wishlist`}>heart</button>)
vi.mock('@/features/wishlist', () => ({ WishlistButton: (props: { artworkId: string }) => WishlistButton(props) }))
// PublicArtworkCard (used by the new "More in {category}" section) imports
// the concrete file, not the barrel above — see PublicArtworkCard.tsx's own
// comment on why. Stubbed the same way MarketplaceGrid.test.tsx already
// does, so rendering a real card here doesn't require a real WishlistProvider.
vi.mock('@/features/wishlist/components/WishlistButton', () => ({ WishlistButton: () => null }))

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
    expect(screen.getByText('#bay')).toBeInTheDocument()
    expect(screen.getByText('#evening')).toBeInTheDocument()
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

  it('never renders any fabricated content — no star rating, review count, stock urgency, or delivery estimate', () => {
    // Not a bare /review|delivery/i check — this page now legitimately has
    // an honest "Reviews aren't connected yet" tab and an honest
    // "delivery... policies are coming" disclaimer (see the tabs below),
    // and both contain those words without fabricating anything. What must
    // never appear is an actual fake rating/count/estimate value.
    usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
    renderPage()
    expect(screen.queryByText(/★|\d+(\.\d+)?\s*stars?|only \d+ left|arrives by|business days|\(\d+\)\s*reviews?/i)).not.toBeInTheDocument()
  })

  // UI-01's AR+AI product-wide requirement, plus the owner's explicit
  // decision to now show real (honestly disabled) commerce controls instead
  // of hiding them entirely — this deliberately replaces the prior "never
  // renders a Buy Now control" expectation this test used to assert.
  describe('commerce area (honestly disabled — Cart/Checkout is Phase 2)', () => {
    it('shows Add to Cart and Buy Now, both genuinely disabled, with an honest explanation — never a completable purchase', () => {
      usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
      renderPage()

      const addToCart = screen.getByRole('button', { name: 'Add to Cart' })
      const buyNow = screen.getByRole('button', { name: 'Buy Now' })
      expect(addToCart).toBeDisabled()
      expect(buyNow).toBeDisabled()
      expect(screen.getByText(/checkout is coming in a later module/i)).toBeInTheDocument()
    })
  })

  describe('AR + AI entry points (UI-01)', () => {
    it('opens an honest "View in AR" panel on click — never a live AR session or fabricated placement', () => {
      usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
      renderPage()

      fireEvent.click(screen.getByRole('button', { name: /view in ar/i }))
      const dialog = screen.getByRole('dialog', { name: 'View in AR' })
      expect(dialog).toHaveTextContent(/isn't connected yet/i)
    })

    it('opens an honest "AI Artwork Analysis" panel on click — never a fabricated score or result', () => {
      usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
      renderPage()

      fireEvent.click(screen.getByRole('button', { name: /analyze with ai/i }))
      const dialog = screen.getByRole('dialog', { name: 'AI Artwork Analysis' })
      expect(dialog).toHaveTextContent(/isn't connected yet/i)
    })
  })

  describe('About the Artist panel (UI-01 visual rebuild)', () => {
    it('shows the real bio once the artist profile has loaded', () => {
      usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
      useArtistDisplayNames.mockReturnValue({ alice: 'Alice Fine Art' })
      useArtistProfile.mockReturnValue({ status: 'loaded', profile: { bio: 'Oil paintings inspired by the coast.' } })
      renderPage()

      expect(screen.getByText('About the Artist')).toBeInTheDocument()
      expect(screen.getByText('Oil paintings inspired by the coast.')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /view full profile/i })).toHaveAttribute('href', '/artists/alice')
    })

    it('still shows the panel (name + profile link, no bio line) while the profile is still loading — never a blank gap', () => {
      usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
      useArtistDisplayNames.mockReturnValue({ alice: 'Alice Fine Art' })
      useArtistProfile.mockReturnValue({ status: 'loading' })
      renderPage()

      expect(screen.getByText('About the Artist')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /view full profile/i })).toBeInTheDocument()
    })
  })

  describe('secondary content tabs (UI-01) — real fields only, honest where nothing is connected', () => {
    it('shows the description and tags under Overview by default', () => {
      usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
      renderPage()

      expect(screen.getByRole('tab', { name: 'Overview', selected: true })).toBeInTheDocument()
      expect(screen.getByText('A real, full description of the painting.')).toBeInTheDocument()
    })

    it('Details tab shows only real artwork fields — no fabricated medium/size/year', () => {
      usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork({ inventoryCount: 3 }) })
      renderPage()

      fireEvent.click(screen.getByRole('tab', { name: 'Details' }))
      expect(screen.getByText('3 available')).toBeInTheDocument()
      expect(screen.queryByText('Medium')).not.toBeInTheDocument()
      expect(screen.queryByText('Size')).not.toBeInTheDocument()
      expect(screen.queryByText('Year')).not.toBeInTheDocument()
    })

    it('Shipping & Returns and Reviews both state plainly that nothing is connected yet — never a fabricated policy or review count', () => {
      usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
      renderPage()

      fireEvent.click(screen.getByRole('tab', { name: 'Shipping & Returns' }))
      expect(screen.getByText(/shipping and returns aren't connected yet/i)).toBeInTheDocument()

      fireEvent.click(screen.getByRole('tab', { name: 'Reviews' }))
      expect(screen.getByText("Reviews aren't connected yet.")).toBeInTheDocument()
    })

    // UI-01 mobile density correction (round 2): on a narrow phone, four
    // tabs including "Shipping & Returns" don't all fit on one line — the
    // tablist must scroll horizontally (never wrap, never clip a tab out of
    // reach) so every tab stays clickable at any width.
    it('keeps every tab reachable via a horizontally-scrolling tablist, never wrapping or hiding one', () => {
      usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
      renderPage()

      const tablist = screen.getByRole('tablist', { name: 'Artwork information' })
      expect(tablist.className).toContain('overflow-x-auto')
      expect(tablist.className).not.toContain('flex-wrap')

      const tabs = screen.getAllByRole('tab')
      expect(tabs.map((tab) => tab.textContent)).toEqual(['Overview', 'Details', 'Shipping & Returns', 'Reviews'])
      tabs.forEach((tab) => expect(tab.className).toContain('shrink-0'))
    })
  })

  // UI-01 — "More in {category}", never framed as AI-produced (see
  // useRelatedArtworks' own comment).
  describe('related artworks (UI-01)', () => {
    it('renders a "More in {category}" section from real related artworks, never labeling it AI-produced', () => {
      usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
      useRelatedArtworks.mockReturnValue({
        status: 'success',
        artworks: [
          { id: 'a2', sellerId: 'bob', title: 'Other Painting', price: 5000, images: [], category: 'painting' },
        ],
      })
      renderPage()

      expect(screen.getByText('More in Painting')).toBeInTheDocument()
      expect(screen.getByText('Other Painting')).toBeInTheDocument()
      expect(screen.queryByText(/AI recommend/i)).not.toBeInTheDocument()
    })

    it('omits the section entirely when there is nothing else to show — no empty section header', () => {
      usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
      useRelatedArtworks.mockReturnValue({ status: 'success', artworks: [] })
      renderPage()

      expect(screen.queryByText(/^More in/)).not.toBeInTheDocument()
    })
  })
})
