import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Artwork } from '@/features/artwork'

const useCart = vi.fn()
const useCartLines = vi.fn()
vi.mock('@/features/cart', () => ({
  useCart: () => useCart(),
  useCartLines: () => useCartLines(),
  CartItemRow: ({
    line,
    onQuantityChange,
    onRemove,
  }: {
    line: { artwork: { id: string; title: string }; quantity: number; lineTotal: number }
    onQuantityChange: (quantity: number) => void
    onRemove: () => void
  }) => (
    <div>
      <span>{line.artwork.title}</span>
      <button type="button" onClick={() => onQuantityChange(line.quantity + 1)}>
        Increase {line.artwork.id}
      </button>
      <button type="button" onClick={onRemove}>
        Remove {line.artwork.id}
      </button>
    </div>
  ),
  CartSummary: ({ subtotal, action }: { subtotal: number; action: ReactNode }) => (
    <div>
      <span>Subtotal: {subtotal}</span>
      {action}
    </div>
  ),
}))

vi.mock('@/features/marketplace', () => ({ useArtistDisplayNames: () => ({}) }))

const { CartPage } = await import('./CartPage')

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

function renderPage() {
  return render(
    <MemoryRouter>
      <CartPage />
    </MemoryRouter>,
  )
}

describe('CartPage', () => {
  it('shows a loading state', () => {
    useCart.mockReturnValue({ mode: 'account', status: 'ready', setQuantity: vi.fn(), removeItem: vi.fn() })
    useCartLines.mockReturnValue({ lines: [], unavailableCount: 0, subtotal: 0, isLoading: true })
    renderPage()
    expect(screen.getByLabelText('Loading cart')).toBeInTheDocument()
  })

  it('shows an empty-cart state with an "Explore Artworks" CTA — no fabricated line items', () => {
    useCart.mockReturnValue({ mode: 'account', status: 'ready', setQuantity: vi.fn(), removeItem: vi.fn() })
    useCartLines.mockReturnValue({ lines: [], unavailableCount: 0, subtotal: 0, isLoading: false })
    renderPage()

    expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explore Artworks' })).toHaveAttribute('href', '/explore')
  })

  it('renders a cart with items and the real subtotal', () => {
    useCart.mockReturnValue({ mode: 'account', status: 'ready', setQuantity: vi.fn(), removeItem: vi.fn() })
    const artwork = buildArtwork()
    useCartLines.mockReturnValue({
      lines: [{ artwork, quantity: 2, lineTotal: 300000 }],
      unavailableCount: 0,
      subtotal: 300000,
      isLoading: false,
    })
    renderPage()

    expect(screen.getByText('Sunset Over the Bay')).toBeInTheDocument()
    expect(screen.getByText('Subtotal: 300000')).toBeInTheDocument()
  })

  it('removing a line calls removeItem with the artwork id', () => {
    const removeItem = vi.fn()
    useCart.mockReturnValue({ mode: 'account', status: 'ready', setQuantity: vi.fn(), removeItem })
    const artwork = buildArtwork()
    useCartLines.mockReturnValue({
      lines: [{ artwork, quantity: 1, lineTotal: 150000 }],
      unavailableCount: 0,
      subtotal: 150000,
      isLoading: false,
    })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Remove a1' }))
    expect(removeItem).toHaveBeenCalledWith('a1')
  })

  it('changing quantity calls setQuantity with the artwork id and new quantity', () => {
    const setQuantity = vi.fn()
    useCart.mockReturnValue({ mode: 'account', status: 'ready', setQuantity, removeItem: vi.fn() })
    const artwork = buildArtwork()
    useCartLines.mockReturnValue({
      lines: [{ artwork, quantity: 1, lineTotal: 150000 }],
      unavailableCount: 0,
      subtotal: 150000,
      isLoading: false,
    })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Increase a1' }))
    expect(setQuantity).toHaveBeenCalledWith('a1', 2)
  })

  it('shows a non-blocking sign-in prompt for a guest with items, not a modal wall', () => {
    useCart.mockReturnValue({ mode: 'guest', status: 'ready', setQuantity: vi.fn(), removeItem: vi.fn() })
    const artwork = buildArtwork()
    useCartLines.mockReturnValue({
      lines: [{ artwork, quantity: 1, lineTotal: 150000 }],
      unavailableCount: 0,
      subtotal: 150000,
      isLoading: false,
    })
    renderPage()

    expect(screen.getByText(/Saved on this device only/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('notes how many cart items are no longer available, without hiding the rest', () => {
    useCart.mockReturnValue({ mode: 'account', status: 'ready', setQuantity: vi.fn(), removeItem: vi.fn() })
    const artwork = buildArtwork()
    useCartLines.mockReturnValue({
      lines: [{ artwork, quantity: 1, lineTotal: 150000 }],
      unavailableCount: 2,
      subtotal: 150000,
      isLoading: false,
    })
    renderPage()

    expect(screen.getByText(/2 cart items are no longer available/)).toBeInTheDocument()
  })

  it('shows an error state on failure, distinct from the empty state', () => {
    useCart.mockReturnValue({ mode: 'account', status: 'error', setQuantity: vi.fn(), removeItem: vi.fn() })
    useCartLines.mockReturnValue({ lines: [], unavailableCount: 0, subtotal: 0, isLoading: false })
    renderPage()

    expect(screen.getByText("Couldn't load your cart. Please try again.")).toBeInTheDocument()
    expect(screen.queryByText('Your cart is empty')).not.toBeInTheDocument()
  })

  it('works without requiring authentication — no sign-in redirect happens for this route', () => {
    useCart.mockReturnValue({ mode: 'guest', status: 'ready', setQuantity: vi.fn(), removeItem: vi.fn() })
    useCartLines.mockReturnValue({ lines: [], unavailableCount: 0, subtotal: 0, isLoading: false })
    renderPage()
    expect(screen.getByRole('heading', { name: 'Cart' })).toBeInTheDocument()
  })
})
