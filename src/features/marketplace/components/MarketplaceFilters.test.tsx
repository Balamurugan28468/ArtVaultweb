import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_MARKETPLACE_FILTERS } from '../types'
import { MarketplaceFilters } from './MarketplaceFilters'

describe('MarketplaceFilters', () => {
  it('renders "All" selected by default alongside every category and sort option', () => {
    render(<MarketplaceFilters filters={DEFAULT_MARKETPLACE_FILTERS} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Painting' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Newest' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls onChange with the selected category, leaving other filters untouched', () => {
    const onChange = vi.fn()
    render(<MarketplaceFilters filters={DEFAULT_MARKETPLACE_FILTERS} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sculpture' }))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_MARKETPLACE_FILTERS, category: 'sculpture' })
  })

  it('calls onChange with the selected sort', () => {
    const onChange = vi.fn()
    render(<MarketplaceFilters filters={DEFAULT_MARKETPLACE_FILTERS} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Price: Low to High' }))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_MARKETPLACE_FILTERS, sort: 'price-asc' })
  })

  it('applies a price range only after the Apply button is pressed, not per keystroke', () => {
    const onChange = vi.fn()
    render(<MarketplaceFilters filters={DEFAULT_MARKETPLACE_FILTERS} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Minimum price'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Maximum price'), { target: { value: '50' } })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_MARKETPLACE_FILTERS, minPrice: 1000, maxPrice: 5000 })
  })

  it('shows a note when a price range forces the sort away from Newest', () => {
    render(
      <MarketplaceFilters
        filters={{ ...DEFAULT_MARKETPLACE_FILTERS, minPrice: 100 }}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText(/A price range is active/)).toBeInTheDocument()
  })

  it('shows a Clear button once a price range is set, and it resets both bounds', () => {
    const onChange = vi.fn()
    render(<MarketplaceFilters filters={{ ...DEFAULT_MARKETPLACE_FILTERS, minPrice: 100 }} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_MARKETPLACE_FILTERS, minPrice: null, maxPrice: null })
  })
})
