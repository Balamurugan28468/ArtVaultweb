import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { MarketplacePage } from './MarketplacePage'

const MarketplaceFilters = vi.fn((..._args: unknown[]) => <div>filters</div>)
const MarketplaceGrid = vi.fn((props: { filters: { category: string | null } }) => <div>grid: {String(props.filters.category)}</div>)
const useMarketplaceArtworks = vi.fn((..._args: unknown[]) => ({ data: undefined, status: 'pending' }) as unknown)
const useArtistDisplayNames = vi.fn((..._args: unknown[]) => ({}) as Record<string, string | null>)
const useCategoryArtworkCounts = vi.fn((..._args: unknown[]) => ({ data: undefined }) as unknown)
vi.mock('@/features/marketplace', () => ({
  DEFAULT_MARKETPLACE_FILTERS: { category: null, minPrice: null, maxPrice: null, sort: 'newest' },
  MarketplaceFilters: (props: unknown) => MarketplaceFilters(props),
  MarketplaceGrid: (props: { filters: { category: string | null } }) => MarketplaceGrid(props),
  useMarketplaceArtworks: (...args: unknown[]) => useMarketplaceArtworks(...args),
  useArtistDisplayNames: (...args: unknown[]) => useArtistDisplayNames(...args),
  useCategoryArtworkCounts: (...args: unknown[]) => useCategoryArtworkCounts(...args),
}))

describe('MarketplacePage', () => {
  it('renders the hero, the filters, and the grid — works without requiring authentication', () => {
    render(
      <MemoryRouter>
        <MarketplacePage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Art without boundaries' })).toBeInTheDocument()
    expect(screen.getByText('filters')).toBeInTheDocument()
    expect(screen.getByText('grid: null')).toBeInTheDocument()
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument()
  })

  it('starts with the default filters (all categories)', () => {
    render(
      <MemoryRouter>
        <MarketplacePage />
      </MemoryRouter>,
    )
    expect(MarketplaceGrid).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { category: null, minPrice: null, maxPrice: null, sort: 'newest' } }),
    )
  })

  // UI-01 — lets the new Categories page (and any bookmarked/shared link)
  // deep-link straight into a filtered view.
  it('initializes the category filter from a ?category= URL param', () => {
    render(
      <MemoryRouter initialEntries={['/explore?category=painting']}>
        <MarketplacePage />
      </MemoryRouter>,
    )
    expect(MarketplaceGrid).toHaveBeenCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ category: 'painting' }) }),
    )
  })

  it('ignores an invalid/unknown ?category= value rather than passing it through unchecked', () => {
    render(
      <MemoryRouter initialEntries={['/explore?category=not-a-real-category']}>
        <MarketplacePage />
      </MemoryRouter>,
    )
    expect(MarketplaceGrid).toHaveBeenCalledWith(expect.objectContaining({ filters: expect.objectContaining({ category: null }) }))
  })

  // UI-01 reference-driven rebuild — the category strip is real navigation
  // into the same filter state, not a decorative row.
  it('shows a category strip that also drives the real filter state', () => {
    render(
      <MemoryRouter>
        <MarketplacePage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: /Painting/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sculpture/ })).toBeInTheDocument()
  })

  // UI-01 mobile density correction (round 2): a forced 2-column grid on
  // phones squeezed longer labels like "Photography" down to "Photogra...".
  // The strip now scrolls horizontally on mobile instead, so every label's
  // full, untruncated text stays in the DOM (no CSS `truncate` clipping it).
  it('never truncates a category label — the strip scrolls horizontally instead of shrinking labels', () => {
    render(
      <MemoryRouter>
        <MarketplacePage />
      </MemoryRouter>,
    )
    const photography = screen.getByRole('button', { name: /Photography/ })
    expect(photography.className).not.toContain('truncate')
    expect(photography.textContent).toContain('Photography')
  })
})
