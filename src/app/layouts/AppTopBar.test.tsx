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
