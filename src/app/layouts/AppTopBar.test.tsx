import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppTopBar } from './AppTopBar'

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))
vi.mock('@/features/auth', () => ({
  SignOutButton: ({ className }: { className?: string }) => (
    <button type="button" className={className}>
      Sign out
    </button>
  ),
}))

// UI-02 — AppTopBar now reads cart item count for its Cart link/badge;
// mocked the same way useAuth is, rather than wrapping every render in a
// real CartProvider (which would pull in Firestore/localStorage for a file
// whose own concern is auth controls, not cart behavior — see
// CartProvider's own tests for that).
const useCart = vi.fn()
vi.mock('@/features/cart', () => ({ useCart: () => useCart() }))

function renderTopBar() {
  return render(
    <MemoryRouter>
      <AppTopBar onOpenDrawer={vi.fn()} />
    </MemoryRouter>,
  )
}

const CUSTOMER_USER = { displayName: 'Jamie Rivera', email: 'jamie@example.com', photoURL: null }

beforeEach(() => {
  useAuth.mockReset()
  useCart.mockReturnValue({ itemCount: 0 })
})

describe('AppTopBar — auth controls (regression coverage)', () => {
  // Real incident this covers: while `status` is 'loading' (AuthProvider's
  // own initial state before Firebase's first onAuthStateChanged callback
  // resolves), this slot previously rendered nothing at all — no Sign
  // in/Create Account, no avatar — which a manual owner review caught as
  // "the authentication controls disappeared."
  it('shows an honest loading placeholder, never nothing, while auth status is resolving', () => {
    useAuth.mockReturnValue({ status: 'loading', user: null, role: null })
    renderTopBar()

    expect(screen.getByLabelText('Loading account status')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create Account' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Account menu')).not.toBeInTheDocument()
  })

  it('shows Sign in and Create Account for a signed-out visitor, routed to the existing real routes', () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null, role: null })
    renderTopBar()

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    expect(screen.getByRole('link', { name: 'Create Account' })).toHaveAttribute('href', '/sign-up')
    expect(screen.queryByLabelText('Account menu')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Loading account status')).not.toBeInTheDocument()
  })

  it("uses the gold commerce-CTA color for Create Account, not AI's purple", () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null, role: null })
    renderTopBar()

    expect(screen.getByRole('link', { name: 'Create Account' }).className).toContain('bg-accent-gold')
  })

  it('shows an account menu with Account and Sign Out for a signed-in CUSTOMER, and no Seller Studio/Admin link', () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: CUSTOMER_USER, role: 'CUSTOMER' })
    renderTopBar()

    fireEvent.click(screen.getByLabelText('Account menu'))

    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Seller Studio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Admin Control Center' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('shows the Seller Studio link for an authenticated SELLER, routed to the existing real route', () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: CUSTOMER_USER, role: 'SELLER' })
    renderTopBar()

    expect(screen.getByRole('link', { name: 'Seller Studio' })).toHaveAttribute('href', '/seller-studio')
    expect(screen.queryByRole('link', { name: 'Admin Control Center' })).not.toBeInTheDocument()
  })

  it('shows the Admin Control Center link for ADMIN and SUPER_ADMIN, routed to the existing real route', () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: CUSTOMER_USER, role: 'ADMIN' })
    const { unmount } = renderTopBar()
    expect(screen.getByRole('link', { name: 'Admin Control Center' })).toHaveAttribute('href', '/admin')
    expect(screen.queryByRole('link', { name: 'Seller Studio' })).not.toBeInTheDocument()
    unmount()

    useAuth.mockReturnValue({ status: 'authenticated', user: CUSTOMER_USER, role: 'SUPER_ADMIN' })
    renderTopBar()
    expect(screen.getByRole('link', { name: 'Admin Control Center' })).toHaveAttribute('href', '/admin')
  })
})

// UI-02: Cart is now a real, working link (previously an honestly-disabled
// placeholder — see this file's git history / AppTopBar.tsx's own comment).
describe('AppTopBar — Cart link (UI-02)', () => {
  it('links to the real /cart route, with no item-count badge when the cart is empty', () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null, role: null })
    useCart.mockReturnValue({ itemCount: 0 })
    renderTopBar()

    expect(screen.getByRole('link', { name: 'Cart' })).toHaveAttribute('href', '/cart')
  })

  it('shows an item-count badge once the cart has items', () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null, role: null })
    useCart.mockReturnValue({ itemCount: 3 })
    renderTopBar()

    expect(screen.getByRole('link', { name: 'Cart, 3 items' })).toBeInTheDocument()
  })

  // Real regression this round: Cart going from `comingSoon` to
  // `available` in NAV_ITEMS (UI-02) made it start appearing in the
  // inline text-nav row too (sourced from the same NAV_ITEMS list),
  // duplicating the dedicated Cart icon right next to it — caught before
  // landing, not after. Mirrors Wishlist's own existing exclusion.
  it('never shows a second "Cart" text link in the inline nav row — the dedicated icon is the only Cart entry', () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: CUSTOMER_USER, role: 'CUSTOMER' })
    useCart.mockReturnValue({ itemCount: 0 })
    renderTopBar()

    const cartLinks = screen.getAllByRole('link', { name: /^Cart/ })
    expect(cartLinks).toHaveLength(1)
    expect(cartLinks[0]).toHaveAttribute('href', '/cart')
  })
})
