import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Artwork } from '@/features/artwork'

const usePublicArtwork = vi.fn()
vi.mock('@/features/artwork', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/artwork')>()
  return { ...actual, usePublicArtwork: (...args: unknown[]) => usePublicArtwork(...args) }
})

vi.mock('@/features/wishlist', () => ({ WishlistButton: () => null }))
const LikeButton = vi.fn(() => <button>star</button>)
vi.mock('@/features/likes', () => ({ LikeButton: () => LikeButton() }))

const { ArtworkArPage } = await import('./ArtworkArPage')

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
    <MemoryRouter initialEntries={[`/artworks/${artworkId}/ar`]}>
      <Routes>
        <Route path="/artworks/:artworkId/ar" element={<ArtworkArPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ArtworkArPage', () => {
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

  it('shows the artwork image and explicitly unavailable AR capabilities', () => {
    usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
    renderPage()
    expect(screen.getByText('Starry Reflections')).toBeInTheDocument()
    expect(screen.getByText('Artwork image preview')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('not available yet')
    expect(screen.queryByText('Point your camera')).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Start AR|Sample Room|Rotate|Resize|Reset/ })).not.toBeInTheDocument()
  })

  it('links to the real artist profile in both navigation layouts', () => {
    usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
    renderPage()
    for (const link of screen.getAllByRole('link', { name: 'Artist Info' })) expect(link).toHaveAttribute('href', '/artists/s1')
  })

  it('links "AI Analysis" to the artwork\'s own dedicated analysis page (present in both the mobile rail and the desktop list)', () => {
    usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
    renderPage()
    const links = screen.getAllByRole('link', { name: /AI Analysis/ })
    expect(links.length).toBe(2)
    for (const link of links) expect(link).toHaveAttribute('href', '/artworks/a1/analysis')
  })

  describe('mobile navigation correction', () => {
    it('renders a compact mobile-only nav rail, separate from the full desktop list — both present in markup, CSS-toggled by breakpoint', () => {
      usePublicArtwork.mockReturnValue({ status: 'success', data: buildArtwork() })
      renderPage()

      const navs = screen.getAllByRole('navigation', { name: 'Artwork' })
      expect(navs).toHaveLength(2)
      const [mobileRail, desktopList] = navs
      expect(mobileRail.className).toContain('lg:hidden')
      expect(desktopList.className).toContain('hidden')
      expect(desktopList.className).toContain('lg:flex')
    })
  })
})
