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

function renderGrid(props: Partial<Parameters<typeof MarketplaceGrid>[0]> = {}) {
  return render(
    <MemoryRouter>
      <MarketplaceGrid filters={DEFAULT_MARKETPLACE_FILTERS} onFiltersChange={vi.fn()} {...props} />
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

  // UI-01 reference-driven rebuild — a real result count/sort/view toolbar,
  // owned here since this is the one component that actually knows the
  // true, currently-filtered result set.
  describe('results toolbar (UI-01)', () => {
    it('shows an exact real count once every result is loaded', () => {
      useMarketplaceArtworks.mockReturnValue({ status: 'success', data: { pages: [{ artworks: [ARTWORK] }] }, hasNextPage: false })
      renderGrid()
      expect(screen.getByText('1 artwork')).toBeInTheDocument()
    })

    it('shows an honest "N+" count (never a fabricated total) while more pages remain', () => {
      useMarketplaceArtworks.mockReturnValue({ status: 'success', data: { pages: [{ artworks: [ARTWORK] }] }, hasNextPage: true })
      renderGrid()
      expect(screen.getByText('1+ artworks')).toBeInTheDocument()
    })

    it('changing Sort calls the real onFiltersChange with the new sort, leaving other filters untouched', () => {
      const onFiltersChange = vi.fn()
      useMarketplaceArtworks.mockReturnValue({ status: 'success', data: { pages: [{ artworks: [ARTWORK] }] }, hasNextPage: false })
      renderGrid({ onFiltersChange })

      fireEvent.change(screen.getByLabelText(/sort by/i), { target: { value: 'price-asc' } })
      expect(onFiltersChange).toHaveBeenCalledWith({ ...DEFAULT_MARKETPLACE_FILTERS, sort: 'price-asc' })
    })

    it('List view is genuinely disabled — never a second, unfinished layout', () => {
      useMarketplaceArtworks.mockReturnValue({ status: 'success', data: { pages: [{ artworks: [ARTWORK] }] }, hasNextPage: false })
      renderGrid()
      const listToggle = screen.getByTitle('List view — coming soon')
      expect(listToggle).toHaveAttribute('aria-disabled', 'true')
    })

    // UI-01 mobile correction: Filters moved from a standalone button between
    // the category strip and the grid into this same toolbar, next to Sort —
    // "[ Filters ] [ Sort ]" together, as specified.
    it('shows a Filters button next to Sort when onOpenFilters is supplied, and calls it on click', () => {
      const onOpenFilters = vi.fn()
      useMarketplaceArtworks.mockReturnValue({ status: 'success', data: { pages: [{ artworks: [ARTWORK] }] }, hasNextPage: false })
      renderGrid({ onOpenFilters })

      fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
      expect(onOpenFilters).toHaveBeenCalledTimes(1)
    })

    it('omits the Filters button entirely when onOpenFilters is not supplied', () => {
      useMarketplaceArtworks.mockReturnValue({ status: 'success', data: { pages: [{ artworks: [ARTWORK] }] }, hasNextPage: false })
      renderGrid()
      expect(screen.queryByRole('button', { name: 'Filters' })).not.toBeInTheDocument()
    })
  })

  // UI-01 — a plain, honestly-scoped client-side title filter over whatever
  // is already loaded (there is no full-text search index behind this; see
  // this component's own comment).
  describe('searchQuery (UI-01)', () => {
    const SECOND_ARTWORK = { ...ARTWORK, id: 'a2', title: 'Ocean View' }

    it('filters the already-loaded artworks by title, case-insensitively', () => {
      useMarketplaceArtworks.mockReturnValue({
        status: 'success',
        data: { pages: [{ artworks: [ARTWORK, SECOND_ARTWORK] }] },
        hasNextPage: false,
      })
      renderGrid({ searchQuery: 'ocean' })
      expect(screen.getByText('Ocean View')).toBeInTheDocument()
      expect(screen.queryByText('Sunset')).not.toBeInTheDocument()
    })

    it('shows an honest "nothing loaded matches" message (not the generic empty state) when a search matches nothing on the loaded page, and still offers Load more', () => {
      useMarketplaceArtworks.mockReturnValue({
        status: 'success',
        data: { pages: [{ artworks: [ARTWORK] }] },
        hasNextPage: true,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
      })
      renderGrid({ searchQuery: 'nonexistent' })
      expect(screen.getByText('No loaded artworks match "nonexistent"')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument()
    })
  })

  // UI-01 reference-driven rebuild — the sidebar's real (loaded-results-
  // scoped) artist filter, applied here the same way the title search is.
  describe('artistQuery (UI-01)', () => {
    const BOB_ARTWORK = { ...ARTWORK, id: 'a2', sellerId: 'bob', title: 'Ocean View' }

    it('filters the already-loaded artworks by the resolved artist name, case-insensitively', () => {
      useMarketplaceArtworks.mockReturnValue({
        status: 'success',
        data: { pages: [{ artworks: [ARTWORK, BOB_ARTWORK] }] },
        hasNextPage: false,
      })
      useArtistDisplayNames.mockReturnValue({ alice: 'Alice Fine Art', bob: 'Bob Sculpture' })
      renderGrid({ artistQuery: 'sculpture' })

      expect(screen.getByText('Ocean View')).toBeInTheDocument()
      expect(screen.queryByText('Sunset')).not.toBeInTheDocument()
    })
  })
})
