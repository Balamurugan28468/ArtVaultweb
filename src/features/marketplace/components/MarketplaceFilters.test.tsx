import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_MARKETPLACE_FILTERS } from '../types'
import { MarketplaceFilters, type MarketplaceFiltersProps } from './MarketplaceFilters'

function renderFilters(overrides: Partial<MarketplaceFiltersProps> = {}) {
  const props: MarketplaceFiltersProps = {
    filters: DEFAULT_MARKETPLACE_FILTERS,
    onChange: vi.fn(),
    artistQuery: '',
    onArtistQueryChange: vi.fn(),
    artistOptions: [],
    onClearAll: vi.fn(),
    ...overrides,
  }
  render(<MarketplaceFilters {...props} />)
  return props
}

describe('MarketplaceFilters', () => {
  it('renders "All" selected by default alongside every category', () => {
    renderFilters()
    expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Painting/ })).toBeInTheDocument()
  })

  it('calls onChange with the selected category, leaving other filters untouched', () => {
    const onChange = vi.fn()
    renderFilters({ onChange })
    fireEvent.click(screen.getByRole('button', { name: /^Sculpture/ }))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_MARKETPLACE_FILTERS, category: 'sculpture' })
  })

  // UI-01 reference-driven rebuild — real counts only, never fabricated.
  it('shows real per-category counts when supplied, and omits them entirely when not (still loading)', () => {
    const { rerender } = render(
      <MarketplaceFilters
        filters={DEFAULT_MARKETPLACE_FILTERS}
        onChange={vi.fn()}
        artistQuery=""
        onArtistQueryChange={vi.fn()}
        artistOptions={[]}
        onClearAll={vi.fn()}
      />,
    )
    expect(screen.queryByText('42')).not.toBeInTheDocument()

    rerender(
      <MarketplaceFilters
        filters={DEFAULT_MARKETPLACE_FILTERS}
        onChange={vi.fn()}
        totalCount={42}
        categoryCounts={{ painting: 10, sculpture: 5, photography: 3, digital: 2, other: 1 }}
        artistQuery=""
        onArtistQueryChange={vi.fn()}
        artistOptions={[]}
        onClearAll={vi.fn()}
      />,
    )
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('applies a price range only after the Apply button is pressed, not per keystroke', () => {
    const onChange = vi.fn()
    renderFilters({ onChange })
    fireEvent.change(screen.getByLabelText('Minimum price'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Maximum price'), { target: { value: '50' } })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_MARKETPLACE_FILTERS, minPrice: 1000, maxPrice: 5000 })
  })

  it('shows a note when a price range forces the sort away from Newest', () => {
    renderFilters({ filters: { ...DEFAULT_MARKETPLACE_FILTERS, minPrice: 100 } })
    expect(screen.getByText(/A price range is active/)).toBeInTheDocument()
  })

  it('shows a Clear button once a price range is set, and it resets both bounds', () => {
    const onChange = vi.fn()
    renderFilters({ filters: { ...DEFAULT_MARKETPLACE_FILTERS, minPrice: 100 }, onChange })
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_MARKETPLACE_FILTERS, minPrice: null, maxPrice: null })
  })

  // UI-01 reference-driven rebuild
  describe('Availability (honestly disabled — no such status exists yet)', () => {
    it('every real option is a genuinely disabled checkbox, never a working filter', () => {
      renderFilters()
      expect(screen.getByRole('checkbox', { name: 'Buy Now' })).toBeDisabled()
      expect(screen.getByRole('checkbox', { name: 'On Auction' })).toBeDisabled()
    })
  })

  describe('Artist (real names, scoped to already-loaded results)', () => {
    it('shows real artist names passed in as options, routing a click into the same filter callback', () => {
      const onArtistQueryChange = vi.fn()
      renderFilters({ artistOptions: ['Alice Fine Art', 'Bob Sculpture'], onArtistQueryChange })
      expect(screen.getByText('Alice Fine Art')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Bob Sculpture'))
      expect(onArtistQueryChange).toHaveBeenCalledWith('Bob Sculpture')
    })

    it('typing in the artist search calls the real filter callback', () => {
      const onArtistQueryChange = vi.fn()
      renderFilters({ onArtistQueryChange })
      fireEvent.change(screen.getByLabelText('Search artists'), { target: { value: 'ali' } })
      expect(onArtistQueryChange).toHaveBeenCalledWith('ali')
    })
  })

  describe('Clear all', () => {
    it('is hidden when nothing is active', () => {
      renderFilters()
      expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument()
    })

    it('appears once a filter is active and calls the real clear-all callback', () => {
      const onClearAll = vi.fn()
      renderFilters({ filters: { ...DEFAULT_MARKETPLACE_FILTERS, category: 'painting' }, onClearAll })
      fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
      expect(onClearAll).toHaveBeenCalledTimes(1)
    })
  })
})
