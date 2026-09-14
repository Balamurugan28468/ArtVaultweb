import { fireEvent, render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Artwork } from '@/features/artwork'

const useSellerArtworks = vi.fn()
vi.mock('@/features/artwork', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/artwork')>()
  return { ...actual, useSellerArtworks: () => useSellerArtworks() }
})

const { ArtworkListPage } = await import('./ArtworkListPage')

const now = Timestamp.now()

function buildArtwork(overrides: Partial<Artwork> = {}): Artwork {
  return {
    id: 'a1',
    sellerId: 'alice',
    title: 'Sunset Over the Bay',
    description: '',
    price: 150000,
    category: 'painting',
    tags: [],
    images: [],
    inventoryCount: 5,
    status: 'DRAFT',
    reviewedAt: null,
    rejectionReason: null,
    likeCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ArtworkListPage />
    </MemoryRouter>,
  )
}

describe('ArtworkListPage', () => {
  it('shows an honest empty state with a real Create Artwork CTA', () => {
    useSellerArtworks.mockReturnValue({ status: 'loaded', artworks: [] })
    renderPage()

    expect(screen.getByText('No artworks yet')).toBeInTheDocument()
    const ctas = screen.getAllByRole('link', { name: 'Create Artwork' })
    for (const cta of ctas) expect(cta).toHaveAttribute('href', '/seller-studio/artworks/new')
  })

  it('shows no filter chips at all when there are no artworks yet', () => {
    useSellerArtworks.mockReturnValue({ status: 'loaded', artworks: [] })
    renderPage()

    expect(screen.queryByRole('button', { name: 'Draft' })).not.toBeInTheDocument()
  })

  it('lists real artworks and the real total count', () => {
    useSellerArtworks.mockReturnValue({ status: 'loaded', artworks: [buildArtwork()] })
    renderPage()

    expect(screen.getByText('Sunset Over the Bay')).toBeInTheDocument()
    expect(screen.getByText('1 artwork total')).toBeInTheDocument()
  })

  it('filters the list by status when a chip is selected', () => {
    useSellerArtworks.mockReturnValue({
      status: 'loaded',
      artworks: [
        buildArtwork({ id: 'd1', status: 'DRAFT', title: 'Draft piece' }),
        buildArtwork({ id: 'p1', status: 'PUBLISHED', title: 'Published piece' }),
      ],
    })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Published' }))

    expect(screen.getByText('Published piece')).toBeInTheDocument()
    expect(screen.queryByText('Draft piece')).not.toBeInTheDocument()
  })

  it('shows an honest "no artworks match this filter" state rather than a blank grid', () => {
    useSellerArtworks.mockReturnValue({
      status: 'loaded',
      artworks: [buildArtwork({ status: 'DRAFT' })],
    })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Published' }))

    expect(screen.getByText('No artworks match this filter')).toBeInTheDocument()
  })

  it('shows a loading state', () => {
    useSellerArtworks.mockReturnValue({ status: 'loading' })
    renderPage()
    expect(screen.getByLabelText('Loading your artworks')).toBeInTheDocument()
  })

  it('shows an error state on failure', () => {
    useSellerArtworks.mockReturnValue({ status: 'error', error: { code: 'unknown', message: 'boom' } })
    renderPage()
    expect(screen.getByText("Couldn't load your artworks")).toBeInTheDocument()
  })
})
