import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

const useMarketplaceArtworks = vi.fn()
const useArtistDisplayNames = vi.fn((..._args: unknown[]) => ({}) as Record<string, string | null>)
vi.mock('@/features/marketplace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/marketplace')>()
  return {
    ...actual,
    useMarketplaceArtworks: (...args: unknown[]) => useMarketplaceArtworks(...args),
    useArtistDisplayNames: (...args: unknown[]) => useArtistDisplayNames(...args),
  }
})

vi.mock('@/features/wishlist/components/WishlistButton', () => ({ WishlistButton: () => null }))

const { HomePage } = await import('./HomePage')

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

const ARTWORK = {
  id: 'a1',
  sellerId: 'alice',
  title: 'Sunset',
  description: 'd',
  price: 1500,
  category: 'painting',
  tags: [],
  images: [],
  inventoryCount: 1,
  status: 'PUBLISHED',
}

describe('HomePage', () => {
  it('renders the editorial hero with a CTA into Explore, regardless of query state', () => {
    useMarketplaceArtworks.mockReturnValue({ status: 'pending', data: undefined })
    renderHome()

    expect(screen.getByText('Belong')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explore Artworks' })).toHaveAttribute('href', '/explore')
  })

  it('shows a loading state for the recently-published section while the query is pending', () => {
    useMarketplaceArtworks.mockReturnValue({ status: 'pending', data: undefined })
    renderHome()

    expect(screen.getByLabelText('Loading recently published artworks')).toBeInTheDocument()
  })

  it('shows an honest empty state — never fabricated artworks — when nothing is published yet', () => {
    useMarketplaceArtworks.mockReturnValue({ status: 'success', data: { pages: [{ artworks: [] }] } })
    renderHome()

    expect(screen.getByText('No artworks published yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Explore' })).toHaveAttribute('href', '/explore')
  })

  it('renders real published artworks from the marketplace query, each linking to its own artwork page (Module 11)', () => {
    useMarketplaceArtworks.mockReturnValue({ status: 'success', data: { pages: [{ artworks: [ARTWORK] }] } })
    useArtistDisplayNames.mockReturnValue({ alice: 'Alice Fine Art' })
    renderHome()

    expect(screen.getByText('Sunset')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sunset' })).toHaveAttribute('href', '/artworks/a1')
    expect(screen.getByRole('link', { name: 'Alice Fine Art' })).toHaveAttribute('href', '/artists/alice')
  })

  it('never repeats the same artwork to fill space when only one is published', () => {
    useMarketplaceArtworks.mockReturnValue({ status: 'success', data: { pages: [{ artworks: [ARTWORK] }] } })
    renderHome()

    expect(screen.getAllByText('Sunset')).toHaveLength(1)
  })

  it('shows an error state with a retry action when the query fails', () => {
    const refetch = vi.fn()
    useMarketplaceArtworks.mockReturnValue({ status: 'error', error: { code: 'unknown', message: 'boom' }, refetch })
    renderHome()

    expect(screen.getByText("Couldn't load recently published artworks")).toBeInTheDocument()
  })

  // UI-01 mobile density correction: Home's own Categories chip row was a
  // second, duplicate category-discovery surface now that Explore owns
  // category discovery (strip + sidebar filter + real counts). Removed
  // entirely, not merely shrunk.
  it('never shows a Categories section — category discovery lives only on Explore', () => {
    useMarketplaceArtworks.mockReturnValue({ status: 'success', data: { pages: [{ artworks: [ARTWORK] }] } })
    renderHome()

    expect(screen.queryByRole('heading', { name: 'Categories' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Painting' })).not.toBeInTheDocument()
  })

  // UI-01 mobile density correction (round 2): these informational cards
  // were previously forced into a plain 2-column grid at every width,
  // squeezing their real sentences down to the point of needing a 2-line
  // clamp even on a 350px phone. They now scroll horizontally on mobile
  // instead of being clamped into narrow columns, so the full, real
  // description text is always present in the DOM, never truncated.
  it('shows the full "Why ArtVault" description text, never truncated, on any screen size', () => {
    useMarketplaceArtworks.mockReturnValue({ status: 'success', data: { pages: [{ artworks: [ARTWORK] }] } })
    renderHome()

    const description = screen.getByText("Every listing is a real artist's own work, reviewed before it goes live.")
    expect(description.className).not.toContain('line-clamp')
  })
})
