import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Artwork } from '@/features/artwork'

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

const useUserProfile = vi.fn()
vi.mock('@/features/account', () => ({ useUserProfile: () => useUserProfile() }))

const useCartLines = vi.fn()
const useCart = vi.fn(() => ({ status: 'ready', mode: 'account' }))
const submit = vi.fn()
const retry = vi.fn()
const useCheckoutOrder = vi.fn()
vi.mock('@/features/checkout/hooks/useCheckoutOrder', () => ({ useCheckoutOrder: () => useCheckoutOrder() }))
beforeEach(() => {
  submit.mockClear()
  retry.mockClear()
  useCheckoutOrder.mockReturnValue({ submit, retry, pending: false, unresolved: null, error: null })
})
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
  AddressPicker: ({ onChange, onSelectionChange }: { onChange: (values: unknown, valid: boolean) => void; onSelectionChange: (id: string | null) => void }) => <div>Shipping address form
    <button onClick={() => { onChange({ fullName: 'Test Buyer' }, true); onSelectionChange('saved-address') }}>Select saved address</button>
    <button onClick={() => { onChange({ fullName: 'Temporary Buyer' }, true); onSelectionChange(null) }}>Use temporary address</button>
  </div>,
  DeliverySection: () => <div>Shipping options aren't connected yet.</div>,
  PaymentSection: () => <div>Payment processing is unavailable.</div>,
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

  it('requires a saved address, submits only selected IDs, and does not enable payment', () => {
    useAuth.mockReturnValue({ user: { email: 'alice@example.com' } })
    useUserProfile.mockReturnValue({ status: 'loaded', profile: { phoneNumber: null, displayName: 'Alice' } })
    useCartLines.mockReturnValue({
      lines: [{ artwork: buildArtwork(), quantity: 1, lineTotal: 150000 }],
      subtotal: 150000,
      isLoading: false,
    })
    renderPage()

    const placeOrder = screen.getByRole('button', { name: 'Create unpaid order' })
    expect(placeOrder).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Select saved address' }))
    expect(placeOrder).toBeEnabled()
    fireEvent.click(placeOrder)
    expect(submit).toHaveBeenCalledWith(['a1'], 'saved-address')
    fireEvent.click(screen.getByRole('button', { name: 'Use temporary address' }))
    expect(placeOrder).toBeDisabled()
    expect(screen.getByText('Payment processing is unavailable.')).toBeInTheDocument()
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
    expect(screen.getByText('Payment processing is unavailable.')).toBeInTheDocument()
  })
})

it('does not present a failed cart read as an empty or ready checkout', () => {
  useAuth.mockReturnValue({ user: { email: 'alice@example.com' } })
  useUserProfile.mockReturnValue({ status: 'loading' })
  useCart.mockReturnValueOnce({ status: 'error', mode: 'account' })
  useCartLines.mockReturnValue({ lines: [], subtotal: 0, isLoading: false, unavailableCount: 0 })
  renderPage()
  expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your cart")
  expect(screen.queryByText('Your cart is empty')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Create unpaid order' })).not.toBeInTheDocument()
})

it('recovers an ambiguous request even when the successful transaction already emptied the cart', () => {
  useCheckoutOrder.mockReturnValue({ submit, retry, pending: false, unresolved: {}, error: 'Result unknown' })
  useCartLines.mockReturnValue({ lines: [], subtotal: 0, isLoading: false, unavailableCount: 0 })
  renderPage()
  expect(screen.queryByText('Your cart is empty')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry previous checkout' }))
  expect(retry).toHaveBeenCalledOnce()
  expect(screen.getByRole('alert')).toHaveTextContent('Result unknown')
})

it('blocks checkout when the remaining stock is reserved', () => {
  useCartLines.mockReturnValue({ lines: [{ artwork: buildArtwork({ inventoryCount: 1, reservedCount: 1 }), quantity: 1, lineTotal: 150000 }], subtotal: 150000, isLoading: false, unavailableCount: 0 })
  renderPage()
  fireEvent.click(screen.getByRole('button', { name: 'Select saved address' }))
  expect(screen.getByRole('button', { name: 'Create unpaid order' })).toBeDisabled()
  expect(submit).not.toHaveBeenCalled()
})
