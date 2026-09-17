import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CartSummary } from './CartSummary'

describe('CartSummary', () => {
  it('shows the real subtotal, formatted from minor currency units', () => {
    render(<CartSummary subtotal={300000} itemCount={2} />)
    // Appears twice by design — the subtotal line and the (currently
    // identical, since no shipping/tax is added) estimated total line.
    expect(screen.getAllByText('₹3000').length).toBe(2)
  })

  it('never fabricates shipping or tax values — shows the honest "Unavailable" placeholder for both', () => {
    render(<CartSummary subtotal={100000} itemCount={1} />)
    const placeholders = screen.getAllByText('Unavailable')
    expect(placeholders).toHaveLength(2)
  })

  it('states that the total excludes shipping and taxes, rather than implying it is the final charge', () => {
    render(<CartSummary subtotal={100000} itemCount={1} />)
    expect(screen.getByText(/not a final payable total/)).toBeInTheDocument()
  })

  it('pluralizes the item count correctly', () => {
    const { rerender } = render(<CartSummary subtotal={100000} itemCount={1} />)
    expect(screen.getByText('Subtotal (1 item)')).toBeInTheDocument()

    rerender(<CartSummary subtotal={200000} itemCount={2} />)
    expect(screen.getByText('Subtotal (2 items)')).toBeInTheDocument()
  })

  it('renders the provided action (e.g. the Proceed to Checkout button)', () => {
    render(<CartSummary subtotal={100000} itemCount={1} action={<button type="button">Proceed to Checkout</button>} />)
    expect(screen.getByRole('button', { name: 'Proceed to Checkout' })).toBeInTheDocument()
  })
})
