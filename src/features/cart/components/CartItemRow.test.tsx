import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { Artwork } from '@/features/artwork'

const isSaved = vi.fn(() => false)
const toggle = vi.fn()
vi.mock('@/features/wishlist', () => ({ useWishlist: () => ({ isSaved, toggle }) }))

const { CartItemRow } = await import('./CartItemRow')

function buildArtwork(overrides: Partial<Artwork> = {}): Artwork {
  return {
    id: 'a1',
    sellerId: 'alice',
    title: 'Sunset Over the Bay',
    description: '',
    price: 150000,
    category: 'painting',
    tags: [],
    images: [],
    inventoryCount: 10,
    status: 'PUBLISHED',
    reviewedAt: null,
    rejectionReason: null,
    likeCount: 0,
    createdAt: null as never,
    updatedAt: null as never,
    ...overrides,
  }
}

function renderRow(overrides: Partial<Artwork> = {}, quantity = 1, handlers: { onQuantityChange?: (q: number) => void; onRemove?: () => void } = {}) {
  const artwork = buildArtwork(overrides)
  const onQuantityChange = handlers.onQuantityChange ?? vi.fn()
  const onRemove = handlers.onRemove ?? vi.fn()
  render(
    <MemoryRouter>
      <CartItemRow
        line={{ artwork, quantity, lineTotal: artwork.price * quantity }}
        artistDisplayName="Alice Fine Art"
        onQuantityChange={onQuantityChange}
        onRemove={onRemove}
      />
    </MemoryRouter>,
  )
  return { onQuantityChange, onRemove }
}

describe('CartItemRow', () => {
  it('shows the artwork title, artist, unit price, and line total', () => {
    renderRow({}, 2)
    expect(screen.getByText('Sunset Over the Bay')).toBeInTheDocument()
    expect(screen.getByText('Alice Fine Art')).toBeInTheDocument()
    expect(screen.getByText('₹1500 each')).toBeInTheDocument()
    expect(screen.getByText('₹3000')).toBeInTheDocument()
  })

  it('calls onRemove when the remove button is clicked', () => {
    const { onRemove } = renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Remove from cart' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('increasing quantity calls onQuantityChange with quantity + 1', () => {
    const { onQuantityChange } = renderRow({ inventoryCount: 10 }, 2)
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }))
    expect(onQuantityChange).toHaveBeenCalledWith(3)
  })

  it('decreasing quantity calls onQuantityChange with quantity - 1', () => {
    const { onQuantityChange } = renderRow({}, 2)
    fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity' }))
    expect(onQuantityChange).toHaveBeenCalledWith(1)
  })

  it('disables decreasing below quantity 1', () => {
    renderRow({}, 1)
    expect(screen.getByRole('button', { name: 'Decrease quantity' })).toBeDisabled()
  })

  it('disables increasing once quantity reaches the real inventory count — never lets the stepper exceed real stock', () => {
    renderRow({ inventoryCount: 3 }, 3)
    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled()
  })

  it('shows an "Out of stock" badge and disables increasing when inventory is 0', () => {
    renderRow({ inventoryCount: 0 }, 1)
    expect(screen.getByText('Out of stock')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled()
  })

  it('shows an honest "Only N left" warning when the saved quantity now exceeds current stock', () => {
    renderRow({ inventoryCount: 2 }, 5)
    expect(screen.getByText(/Only 2 left — reduce quantity/)).toBeInTheDocument()
  })

  it('"Save for later" saves to the wishlist (if not already saved) and removes the cart line', async () => {
    toggle.mockResolvedValueOnce(true)
    isSaved.mockReturnValue(false)
    const { onRemove } = renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Save for later' }))
    expect(toggle).toHaveBeenCalledWith('a1')
    await waitFor(() => expect(onRemove).toHaveBeenCalledTimes(1))
  })

  it('"Save for later" never un-saves an already-wishlisted artwork — only removes the cart line', async () => {
    isSaved.mockReturnValue(true)
    const { onRemove } = renderRow()
    toggle.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Save for later' }))
    expect(toggle).not.toHaveBeenCalled()
    expect(onRemove).toHaveBeenCalledTimes(1)
  })
})

it('retains the cart item when saving to the wishlist fails', async () => {
  isSaved.mockReturnValue(false)
  let finish!: (ok: boolean) => void
  toggle.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve }))
  const { onRemove } = renderRow()
  fireEvent.click(screen.getByRole('button', { name: 'Save for later' }))
  expect(onRemove).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Remove from cart' })).toBeDisabled()
  await act(async () => finish(false))
  expect(onRemove).not.toHaveBeenCalled()
})
it('caps the stepper at the existing cart limit even when more stock exists', () => {
  renderRow({ inventoryCount: 200 }, 99)
  expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled()
})
