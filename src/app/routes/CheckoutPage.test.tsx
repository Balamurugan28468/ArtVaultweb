import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Artwork } from '@/features/artwork'

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

const useUserProfile = vi.fn()
vi.mock('@/features/account', () => ({ useUserProfile: () => useUserProfile() }))

const useCartLines = vi.fn()
const useCart = vi.fn(() => ({ status: 'ready' }))
vi.mock('@/features/cart', () => ({
  useCartLines: () => useCartLines(),
  useCart: () => useCart(),
  CartSummary: ({ subtotal, action }: { subtotal: number; action: ReactNode }) => (
    <div>
      <span>Subtotal: {subtotal}</span>
      {action}
    </div>
  ),
}))

vi.mock('@/features/checkout', () => ({
  AddressPicker: () => <div>Shipping address form</div>,
  DeliverySection: () => <div>Shipping options aren't connected yet.</div>,
  PaymentSection: () => <div>Order placement and payment processing are unavailable.</div>,
}))

vi.mock('@/features/marketplace', () => ({ useArtistDisplayNames: () => ({}) }))

const { CheckoutPage } = await import('./CheckoutPage')

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
      <CheckoutPage />
    </MemoryRouter>,
  )
}

describe('CheckoutPage', () => {
  it('shows an empty-cart state rather than a checkout form when the cart has nothing in it', () => {
    useAuth.mockReturnValue({ user: { email: 'alice@example.com' } })
    useUserProfile.mockReturnValue({ status: 'loaded', profile: { phoneNumber: null, displayName: 'Alice' } })
    useCartLines.mockReturnValue({ lines: [], subtotal: 0, isLoading: false })
    renderPage()

    expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explore Artworks' })).toHaveAttribute('href', '/explore')
  })

  it('shows real contact details from the signed-in account', () => {
    useAuth.mockReturnValue({ user: { email: 'alice@example.com' } })
    useUserProfile.mockReturnValue({ status: 'loaded', profile: { phoneNumber: '+91 98765 43210', displayName: 'Alice' } })
    useCartLines.mockReturnValue({ lines: [{ artwork: buildArtwork(), quantity: 1, lineTotal: 150000 }], subtotal: 150000, isLoading: false })
    renderPage()

    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByText('+91 98765 43210')).toBeInTheDocument()
  })

  it('shows the real order review with artwork title and the live subtotal', () => {
    useAuth.mockReturnValue({ user: { email: 'alice@example.com' } })
    useUserProfile.mockReturnValue({ status: 'loaded', profile: { phoneNumber: null, displayName: 'Alice' } })
    useCartLines.mockReturnValue({
      lines: [{ artwork: buildArtwork(), quantity: 2, lineTotal: 300000 }],
      subtotal: 300000,
      isLoading: false,
    })
    renderPage()

    expect(screen.getByText('Sunset Over the Bay')).toBeInTheDocument()
    expect(screen.getByText('Subtotal: 300000')).toBeInTheDocument()
  })

  it('keeps "Place Order" genuinely disabled, with an honest explanation — never a completable purchase', () => {
    useAuth.mockReturnValue({ user: { email: 'alice@example.com' } })
    useUserProfile.mockReturnValue({ status: 'loaded', profile: { phoneNumber: null, displayName: 'Alice' } })
    useCartLines.mockReturnValue({
      lines: [{ artwork: buildArtwork(), quantity: 1, lineTotal: 150000 }],
      subtotal: 150000,
      isLoading: false,
    })
    renderPage()

    const placeOrder = screen.getByRole('button', { name: 'Place Order' })
    expect(placeOrder).toBeDisabled()
    expect(screen.getAllByText(/Order placement and payment processing are unavailable/).length).toBeGreaterThan(0)
  })

  it('shows the honest, non-functional Delivery and Payment sections — never a fake shipping method or payment form', () => {
    useAuth.mockReturnValue({ user: { email: 'alice@example.com' } })
    useUserProfile.mockReturnValue({ status: 'loaded', profile: { phoneNumber: null, displayName: 'Alice' } })
    useCartLines.mockReturnValue({
      lines: [{ artwork: buildArtwork(), quantity: 1, lineTotal: 150000 }],
      subtotal: 150000,
      isLoading: false,
    })
    renderPage()

    expect(screen.getByText("Shipping options aren't connected yet.")).toBeInTheDocument()
    expect(screen.getAllByText(/Order placement and payment processing are unavailable/).length).toBeGreaterThan(0)
  })
})

it('does not present a failed cart read as an empty or ready checkout', () => {
  useAuth.mockReturnValue({ user: { email: 'alice@example.com' } })
  useUserProfile.mockReturnValue({ status: 'loading' })
  useCart.mockReturnValueOnce({ status: 'error' })
  useCartLines.mockReturnValue({ lines: [], subtotal: 0, isLoading: false, unavailableCount: 0 })
  renderPage()
  expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your cart")
  expect(screen.queryByText('Your cart is empty')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Place Order' })).not.toBeInTheDocument()
})
