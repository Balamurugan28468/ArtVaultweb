import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_MARKETPLACE_FILTERS } from '../types'

const useMarketplaceArtworks = vi.fn()
vi.mock('../hooks/useMarketplaceArtworks', () => ({ useMarketplaceArtworks: (...args: unknown[]) => useMarketplaceArtworks(...args) }))

const useArtistDisplayNames = vi.fn((..._args: unknown[]) => ({}) as Record<string, string | null>)
vi.mock('../hooks/useArtistDisplayNames', () => ({ useArtistDisplayNames: (...args: unknown[]) => useArtistDisplayNames(...args) }))

vi.mock('@/features/wishlist/components/WishlistButton', () => ({ WishlistButton: () => null }))

const { MarketplaceGrid } = await import('./MarketplaceGrid')

function renderGrid() {
  return render(
    <MemoryRouter>
      <MarketplaceGrid filters={DEFAULT_MARKETPLACE_FILTERS} />
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

describe('MarketplaceGrid', () => {
  it('shows a loading state while the first page is pending', () => {
    useMarketplaceArtworks.mockReturnValue({ status: 'pending', data: undefined })
    renderGrid()
    expect(screen.getByLabelText('Loading marketplace artworks')).toBeInTheDocument()
  })

  it('shows an error state with a retry action on failure', () => {
    const refetch = vi.fn()
    useMarketplaceArtworks.mockReturnValue({ status: 'error', error: { code: 'unknown', message: 'boom' }, refetch })
    renderGrid()
    expect(screen.getByText("Couldn't load the marketplace")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('shows an empty state when no artworks match', () => {
    useMarketplaceArtworks.mockReturnValue({ status: 'success', data: { pages: [{ artworks: [] }] }, hasNextPage: false })
    renderGrid()
    expect(screen.getByText('No artworks match these filters')).toBeInTheDocument()
  })

  it('renders each artwork card linking to its own artwork page, and its resolved seller name linking to the artist page (Module 11)', () => {
    useMarketplaceArtworks.mockReturnValue({ status: 'success', data: { pages: [{ artworks: [ARTWORK] }] }, hasNextPage: false })
    useArtistDisplayNames.mockReturnValue({ alice: 'Alice Fine Art' })
    renderGrid()

    expect(screen.getByText('Sunset')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sunset' })).toHaveAttribute('href', '/artworks/a1')
    expect(screen.getByRole('link', { name: 'Alice Fine Art' })).toHaveAttribute('href', '/artists/alice')
  })

  it('never renders an edit, delete, publish, or reject control', () => {
    useMarketplaceArtworks.mockReturnValue({ status: 'success', data: { pages: [{ artworks: [ARTWORK] }] }, hasNextPage: false })
    renderGrid()
    expect(screen.queryByRole('button', { name: /edit|delete|publish|reject/i })).not.toBeInTheDocument()
  })

  it('shows a Load more button while more pages remain, and fetches the next page on click', () => {
    const fetchNextPage = vi.fn()
    useMarketplaceArtworks.mockReturnValue({
      status: 'success',
      data: { pages: [{ artworks: [ARTWORK] }] },
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage,
    })
    renderGrid()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(fetchNextPage).toHaveBeenCalledTimes(1)
  })

  it('shows an end-of-results message once there are no more pages', () => {
    useMarketplaceArtworks.mockReturnValue({ status: 'success', data: { pages: [{ artworks: [ARTWORK] }] }, hasNextPage: false })
    renderGrid()
    expect(screen.getByText("You've reached the end of the marketplace.")).toBeInTheDocument()
  })
})
