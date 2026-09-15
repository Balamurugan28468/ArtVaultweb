import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Artwork } from '@/features/artwork'

const PublicArtworkCard = vi.fn((props: { artwork: Artwork }) => <div>card: {props.artwork.title}</div>)
vi.mock('@/features/artwork', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/artwork')>()
  return { ...actual, PublicArtworkCard: (props: { artwork: Artwork }) => PublicArtworkCard(props) }
})

const useArtistDisplayNames = vi.fn((..._args: unknown[]) => ({}) as Record<string, string | null>)
vi.mock('@/features/marketplace', () => ({ useArtistDisplayNames: (...args: unknown[]) => useArtistDisplayNames(...args) }))

const useForYouArtworks = vi.fn()
const useSimilarArtworks = vi.fn()
const useTrendingArtworks = vi.fn()
vi.mock('@/features/recommendations', () => ({
  useForYouArtworks: () => useForYouArtworks(),
  useSimilarArtworks: () => useSimilarArtworks(),
  useTrendingArtworks: () => useTrendingArtworks(),
}))

const { RecommendationsPage } = await import('./RecommendationsPage')

function buildArtwork(overrides: Partial<Artwork> = {}): Artwork {
  return { id: 'a1', sellerId: 's1', title: 'Moonlit Path', category: 'painting', ...overrides } as unknown as Artwork
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RecommendationsPage />
    </MemoryRouter>,
  )
}

describe('RecommendationsPage', () => {
  it('renders the real page title and honest, non-AI-labeled subtitle', () => {
    useForYouArtworks.mockReturnValue({ status: 'success', artworks: [], personalized: false })
    useSimilarArtworks.mockReturnValue({ status: 'success', artworks: [], anchorCategory: null })
    useTrendingArtworks.mockReturnValue({ status: 'success', data: [] })
    renderPage()

    expect(screen.getByText('Recommended for You')).toBeInTheDocument()
    expect(screen.getByText('Discover artworks based on your interests and activity.')).toBeInTheDocument()
  })

  it('defaults to the "For You" tab and shows an honest empty state with no real Wishlist activity', () => {
    useForYouArtworks.mockReturnValue({ status: 'success', artworks: [], personalized: false })
    useSimilarArtworks.mockReturnValue({ status: 'success', artworks: [], anchorCategory: null })
    useTrendingArtworks.mockReturnValue({ status: 'success', data: [] })
    renderPage()

    expect(screen.getByRole('tab', { name: 'For You' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Nothing to recommend yet')).toBeInTheDocument()
  })

  it('renders real "For You" artworks when they exist', () => {
    useForYouArtworks.mockReturnValue({ status: 'success', artworks: [buildArtwork()], personalized: true })
    useSimilarArtworks.mockReturnValue({ status: 'success', artworks: [], anchorCategory: null })
    useTrendingArtworks.mockReturnValue({ status: 'success', data: [] })
    renderPage()

    expect(screen.getByText('card: Moonlit Path')).toBeInTheDocument()
  })

  it('switches to Trending Now and shows real trending artworks — no sign-in/activity required', () => {
    useForYouArtworks.mockReturnValue({ status: 'success', artworks: [], personalized: false })
    useSimilarArtworks.mockReturnValue({ status: 'success', artworks: [], anchorCategory: null })
    useTrendingArtworks.mockReturnValue({ status: 'success', data: [buildArtwork({ id: 'trend-1', title: 'Golden Serenity' })] })
    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Trending Now' }))
    expect(screen.getByText('card: Golden Serenity')).toBeInTheDocument()
  })

  it('shows an honest "not available yet" state for Artists You Follow — Follows was never built', () => {
    useForYouArtworks.mockReturnValue({ status: 'success', artworks: [], personalized: false })
    useSimilarArtworks.mockReturnValue({ status: 'success', artworks: [], anchorCategory: null })
    useTrendingArtworks.mockReturnValue({ status: 'success', data: [] })
    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Artists You Follow' }))
    expect(screen.getByText("Following artists isn't available yet")).toBeInTheDocument()
  })

  it('shows an honest "not available yet" state for Based on Your Likes — never a fabricated per-user like list', () => {
    useForYouArtworks.mockReturnValue({ status: 'success', artworks: [], personalized: false })
    useSimilarArtworks.mockReturnValue({ status: 'success', artworks: [], anchorCategory: null })
    useTrendingArtworks.mockReturnValue({ status: 'success', data: [] })
    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Based on Your Likes' }))
    expect(screen.getByText("Picks based on your Likes aren't available yet")).toBeInTheDocument()
  })

  it('shows a loading state for the active tab', () => {
    useForYouArtworks.mockReturnValue({ status: 'loading', artworks: [], personalized: false })
    useSimilarArtworks.mockReturnValue({ status: 'success', artworks: [], anchorCategory: null })
    useTrendingArtworks.mockReturnValue({ status: 'success', data: [] })
    renderPage()

    expect(screen.getByLabelText('Loading recommendations')).toBeInTheDocument()
  })

  it('shows an error state, distinct from empty', () => {
    useForYouArtworks.mockReturnValue({ status: 'error', artworks: [], personalized: false })
    useSimilarArtworks.mockReturnValue({ status: 'success', artworks: [], anchorCategory: null })
    useTrendingArtworks.mockReturnValue({ status: 'success', data: [] })
    renderPage()

    expect(screen.getByText("Couldn't load recommendations")).toBeInTheDocument()
  })
})
