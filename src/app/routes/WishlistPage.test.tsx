import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

const useWishlist = vi.fn()
const useWishlistArtworks = vi.fn()
vi.mock('@/features/wishlist', () => ({
  useWishlist: () => useWishlist(),
  useWishlistArtworks: () => useWishlistArtworks(),
}))

vi.mock('@/features/artwork', () => ({
  PublicArtworkCard: ({ artwork }: { artwork: { title: string } }) => <div>{artwork.title}</div>,
}))

const { WishlistPage } = await import('./WishlistPage')

function renderPage() {
  return render(
    <MemoryRouter>
      <WishlistPage />
    </MemoryRouter>,
  )
}

const ARTWORK = { id: 'a1', sellerId: 'alice', title: 'Sunset' }

describe('WishlistPage', () => {
  it('shows a loading state', () => {
    useWishlist.mockReturnValue({ mode: 'account', status: 'ready' })
    useWishlistArtworks.mockReturnValue({ artworks: [], unavailableCount: 0, isLoading: true })
    renderPage()
    expect(screen.getByLabelText('Loading wishlist')).toBeInTheDocument()
  })

  it('shows an empty state with a CTA back to /explore', () => {
    useWishlist.mockReturnValue({ mode: 'account', status: 'ready' })
    useWishlistArtworks.mockReturnValue({ artworks: [], unavailableCount: 0, isLoading: false })
    renderPage()
    expect(screen.getByText("You haven't saved any artworks yet")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explore art' })).toHaveAttribute('href', '/explore')
  })

  it('renders each saved artwork (Module 11: PublicArtworkCard now owns its own navigation — see its own test file for link coverage)', () => {
    useWishlist.mockReturnValue({ mode: 'account', status: 'ready' })
    useWishlistArtworks.mockReturnValue({ artworks: [ARTWORK], unavailableCount: 0, isLoading: false })
    renderPage()
    expect(screen.getByText('Sunset')).toBeInTheDocument()
  })

  it('shows the saved count in the page description', () => {
    useWishlist.mockReturnValue({ mode: 'account', status: 'ready' })
    useWishlistArtworks.mockReturnValue({ artworks: [ARTWORK], unavailableCount: 0, isLoading: false })
    renderPage()
    expect(screen.getByText('1 artwork saved')).toBeInTheDocument()
  })

  it('notes how many saved artworks are no longer available, without hiding the rest', () => {
    useWishlist.mockReturnValue({ mode: 'account', status: 'ready' })
    useWishlistArtworks.mockReturnValue({ artworks: [ARTWORK], unavailableCount: 2, isLoading: false })
    renderPage()
    expect(screen.getByText('2 saved artworks are no longer available.')).toBeInTheDocument()
  })

  it('shows a non-blocking sign-in prompt for a guest with saved items, not a modal wall', () => {
    useWishlist.mockReturnValue({ mode: 'guest', status: 'ready' })
    useWishlistArtworks.mockReturnValue({ artworks: [ARTWORK], unavailableCount: 0, isLoading: false })
    renderPage()
    expect(screen.getByText(/Saved on this device only/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows no sign-in prompt for a guest with nothing saved yet', () => {
    useWishlist.mockReturnValue({ mode: 'guest', status: 'ready' })
    useWishlistArtworks.mockReturnValue({ artworks: [], unavailableCount: 0, isLoading: false })
    renderPage()
    expect(screen.queryByText(/Saved on this device only/)).not.toBeInTheDocument()
  })

  it('shows no sign-in prompt for an account-mode (already signed-in) user', () => {
    useWishlist.mockReturnValue({ mode: 'account', status: 'ready' })
    useWishlistArtworks.mockReturnValue({ artworks: [ARTWORK], unavailableCount: 0, isLoading: false })
    renderPage()
    expect(screen.queryByText(/Saved on this device only/)).not.toBeInTheDocument()
  })

  it('shows an error state on failure, distinct from the empty state', () => {
    useWishlist.mockReturnValue({ mode: 'account', status: 'error' })
    useWishlistArtworks.mockReturnValue({ artworks: [], unavailableCount: 0, isLoading: false })
    renderPage()
    expect(screen.getByText("Couldn't load your wishlist")).toBeInTheDocument()
    expect(screen.queryByText("You haven't saved any artworks yet")).not.toBeInTheDocument()
  })

  it('works without requiring authentication — no sign-in redirect happens for this route', () => {
    useWishlist.mockReturnValue({ mode: 'guest', status: 'ready' })
    useWishlistArtworks.mockReturnValue({ artworks: [], unavailableCount: 0, isLoading: false })
    renderPage()
    expect(screen.getByRole('heading', { name: 'Wishlist' })).toBeInTheDocument()
  })
})
