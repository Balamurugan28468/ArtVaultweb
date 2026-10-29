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
const sourceSelected = vi.fn()
const retry = vi.fn()
const loadMore = vi.fn()
vi.mock('@/features/recommendations', () => ({
  useRecommendations: (mode: string) => {
    sourceSelected(mode)
    const trending = useTrendingArtworks()
    const related = useSimilarArtworks()
    const personal = useForYouArtworks()
    const data = mode === 'trending' ? trending : mode === 'related' ? related : personal
    const artworks = data.artworks ?? data.data ?? []
    return { refetch: retry, fetchNextPage: loadMore, ...data, status: data.status === 'loading' ? 'pending' : data.status, artworks,
      items: artworks.map((artwork: Artwork) => ({ artwork, reason: 'Real marketplace activity', score: 50 })) }
  },
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

  it('shows a genuine empty result for Artists You Follow when there is no matching activity', () => {
    useForYouArtworks.mockReturnValue({ status: 'success', artworks: [], personalized: false })
    useSimilarArtworks.mockReturnValue({ status: 'success', artworks: [], anchorCategory: null })
    useTrendingArtworks.mockReturnValue({ status: 'success', data: [] })
    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Artists You Follow' }))
    expect(screen.getByRole('tab', { name: 'Artists You Follow' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Nothing to recommend yet')).toBeInTheDocument()
  })

  it('shows no fabricated per-user recommendations when Based on Your Likes is empty', () => {
    useForYouArtworks.mockReturnValue({ status: 'success', artworks: [], personalized: false })
    useSimilarArtworks.mockReturnValue({ status: 'success', artworks: [], anchorCategory: null })
    useTrendingArtworks.mockReturnValue({ status: 'success', data: [] })
    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Based on Your Likes' }))
    expect(screen.getByRole('tab', { name: 'Based on Your Likes' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Nothing to recommend yet')).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: 'Retry recommendations' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('renders explanations, enables pagination and disables an in-flight load', () => {
    useForYouArtworks.mockReturnValue({ status: 'success', artworks: [buildArtwork()], personalized: true, hasNextPage: true })
    const view = renderPage()
    expect(screen.getByText('Real marketplace activity')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load more recommendations' }))
    expect(loadMore).toHaveBeenCalledOnce()
    useForYouArtworks.mockReturnValue({ status: 'success', artworks: [], hasNextPage: true, isFetchingNextPage: true })
    view.rerender(<MemoryRouter><RecommendationsPage /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /Loading/ })).toBeDisabled()
  })

  it.each([['Artists You Follow', 'following'], ['Based on Your Likes', 'liked'], ['New Discoveries', 'new']])('loads the correct authorized feed for %s', (label, mode) => {
    useForYouArtworks.mockReturnValue({ status: 'success', artworks: [], personalized: false })
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: label }))
    expect(sourceSelected).toHaveBeenLastCalledWith(mode)
  })

  it('supports keyboard tab navigation and focus', () => {
    useForYouArtworks.mockReturnValue({ status: 'success', artworks: [], personalized: false })
    useSimilarArtworks.mockReturnValue({ status: 'success', artworks: [] })
    renderPage()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'For You' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Similar Artworks' })).toHaveFocus()
    expect(sourceSelected).toHaveBeenLastCalledWith('related')
  })
})
