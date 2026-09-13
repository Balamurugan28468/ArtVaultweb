import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

const getQuantity = vi.fn()
const addItem = vi.fn()
const success = vi.fn()
vi.mock('../context/CartProvider', () => ({ useCart: () => ({ getQuantity, addItem }) }))
vi.mock('@/shared/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/ui')>()
  return { ...actual, useToast: () => ({ success, error: vi.fn(), info: vi.fn() }) }
})

const { AddToCartButton } = await import('./AddToCartButton')

function renderButton(artworkId = 'a1', inventoryCount = 5) {
  return render(
    <MemoryRouter>
      <AddToCartButton artworkId={artworkId} inventoryCount={inventoryCount} />
    </MemoryRouter>,
  )
}

describe('AddToCartButton', () => {
  it('shows "Sold out", disabled, when inventoryCount is 0 — never adds a line for stock that does not exist', () => {
    getQuantity.mockReturnValue(0)
    renderButton('a1', 0)
    const button = screen.getByRole('button', { name: 'Sold out' })
    expect(button).toBeDisabled()
  })

  it('shows "Add to Cart" when not yet in the cart, and calls addItem(artworkId, 1) on click', () => {
    getQuantity.mockReturnValue(0)
    renderButton('a1', 5)
    fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }))
    expect(addItem).toHaveBeenCalledWith('a1', 1)
    expect(success).toHaveBeenCalled()
  })

  it('shows an honest "In cart (n)" link to /cart once the artwork is already in the cart, rather than a button that keeps re-adding', () => {
    getQuantity.mockReturnValue(3)
    renderButton('a1', 5)
    const link = screen.getByRole('link', { name: /In cart: 3/ })
    expect(link).toHaveAttribute('href', '/cart')
    expect(screen.queryByRole('button', { name: 'Add to Cart' })).not.toBeInTheDocument()
  })
})
