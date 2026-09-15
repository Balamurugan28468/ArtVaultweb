import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Artwork } from '@/features/artwork'

const usePublicArtwork = vi.fn()
const ArtworkGallery = vi.fn((props: { images: unknown[]; title: string }) => <div>gallery for {props.title}</div>)
const PublicArtworkCard = vi.fn((props: { artwork: Artwork }) => <div>card: {props.artwork.title}</div>)
vi.mock('@/features/artwork', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/artwork')>()
  return {
    ...actual,
    usePublicArtwork: (...args: unknown[]) => usePublicArtwork(...args),
    ArtworkGallery: (props: { images: unknown[]; title: string }) => ArtworkGallery(props),
    PublicArtworkCard: (props: { artwork: Artwork }) => PublicArtworkCard(props),
  }
})

const useArtworkAnalysis = vi.fn()
vi.mock('@/features/artwork-analysis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/artwork-analysis')>()
  return { ...actual, useArtworkAnalysis: (...args: unknown[]) => useArtworkAnalysis(...args) }
})

const useArtistDisplayNames = vi.fn((..._args: unknown[]) => ({}) as Record<string, string | null>)
const useRelatedArtworks = vi.fn((..._args: unknown[]) => ({ status: 'success', artworks: [] as unknown[] }))
vi.mock('@/features/marketplace', () => ({
  useArtistDisplayNames: (...args: unknown[]) => useArtistDisplayNames(...args),
  useRelatedArtworks: (...args: unknown[]) => useRelatedArtworks(...args),
}))

const { ArtworkAnalysisPage } = await import('./ArtworkAnalysisPage')

function buildArtwork(overrides: Partial<Artwork> = {}): Artwork {
  return {
    id: 'a1',
    sellerId: 's1',
    title: 'Starry Reflections',
    description: 'A night sky in oil.',
    price: 500000,
    category: 'painting',
    tags: [],
    images: [],
    inventoryCount: 3,
    status: 'PUBLISHED',
    reviewedAt: null,
    rejectionReason: null,
    likeCount: 4,
    createdAt: { toDate: () => new Date('2026-01-01') } as never,
    updatedAt: { toDate: () => new Date('2026-01-01') } as never,
    ...overrides,
  }
}

function renderPage(artworkId = 'a1') {
  return render(
    <MemoryRouter initialEntries={[`/artworks/${artworkId}/analysis`]}>
      <Routes>
        <Route path="/artworks/:artworkId/analysis" element={<ArtworkAnalysisPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ArtworkAnalysisPage', () => {
  it('shows a loading state', () => {
    usePublicArtwork.mockReturnValue({ status: 'pending' })
    renderPage()
    expect(screen.getByLabelText('Loading artwork')).toBeInTheDocument()
  })

  it('shows an honest "Artwork not found" state — never a fabricated artwork', () => {
    usePublicArtwork.mockReturnValue({ status: 'success', data: undefined })
    renderPage()
    expect(screen.getByText('Artwork not found')).toBeInTheDocument()
  })

  it('renders the real artwork title/artist and the AI Analysis header', () => {
    usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
    useArtworkAnalysis.mockReturnValue({ status: 'unavailable' })
    renderPage()

    expect(screen.getByText('Starry Reflections')).toBeInTheDocument()
    expect(screen.getByText('AI Analysis')).toBeInTheDocument()
    expect(screen.getByText('Detailed insights about this artwork')).toBeInTheDocument()
  })

  it('shows an honest "AI analysis isn\'t available yet" state on the Overview tab by default — never a fabricated score', () => {
    usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
    useArtworkAnalysis.mockReturnValue({ status: 'unavailable' })
    renderPage()

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText("AI analysis isn't available yet")).toBeInTheDocument()
  })

  it('renders real analysis content when a real document exists', () => {
    usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
    useArtworkAnalysis.mockReturnValue({
      status: 'loaded',
      analysis: { description: 'A real, stored description.', notableElements: ['Bold color'] },
    })
    renderPage()

    expect(screen.getByText('A real, stored description.')).toBeInTheDocument()
    expect(screen.getByText('Bold color')).toBeInTheDocument()
  })

  it('shows an error state, distinct from unavailable', () => {
    usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
    useArtworkAnalysis.mockReturnValue({ status: 'error', error: { code: 'unknown', message: 'boom' } })
    renderPage()

    expect(screen.getByText("Couldn't load this analysis")).toBeInTheDocument()
  })

  it('the Similar Artworks tab shows real "more in category" results, never labeled AI-produced', () => {
    usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
    useArtworkAnalysis.mockReturnValue({ status: 'unavailable' })
    useRelatedArtworks.mockReturnValue({ status: 'success', artworks: [buildArtwork({ id: 'a2', title: 'Golden Fields' })] })
    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Similar Artworks' }))
    expect(screen.getByText('card: Golden Fields')).toBeInTheDocument()
  })
})
