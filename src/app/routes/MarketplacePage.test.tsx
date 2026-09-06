import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { MarketplacePage } from './MarketplacePage'

const MarketplaceFilters = vi.fn((..._args: unknown[]) => <div>filters</div>)
const MarketplaceGrid = vi.fn((props: { filters: { category: string | null } }) => <div>grid: {String(props.filters.category)}</div>)
vi.mock('@/features/marketplace', () => ({
  DEFAULT_MARKETPLACE_FILTERS: { category: null, minPrice: null, maxPrice: null, sort: 'newest' },
  MarketplaceFilters: (props: unknown) => MarketplaceFilters(props),
  MarketplaceGrid: (props: { filters: { category: string | null } }) => MarketplaceGrid(props),
}))

describe('MarketplacePage', () => {
  it('renders a heading, the filters, and the grid — works without requiring authentication', () => {
    render(
      <MemoryRouter>
        <MarketplacePage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Explore' })).toBeInTheDocument()
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
})
