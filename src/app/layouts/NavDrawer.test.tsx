import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NavDrawer } from './NavDrawer'

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))
vi.mock('@/features/auth', () => ({
  SignOutButton: ({ className }: { className?: string }) => (
    <button type="button" className={className}>
      Sign out
    </button>
  ),
}))

function renderDrawer() {
  return render(
    <MemoryRouter>
      <NavDrawer open onClose={vi.fn()} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAuth.mockReset()
})

describe('NavDrawer — mobile auth controls (regression coverage)', () => {
  it('shows an honest loading placeholder, never nothing, while auth status is resolving', () => {
    useAuth.mockReturnValue({ status: 'loading', role: null })
    renderDrawer()

    expect(screen.getByLabelText('Loading account status')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create Account' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
  })

  it('shows Sign in and Create Account for a signed-out visitor, routed to the existing real routes', () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', role: null })
    renderDrawer()

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    expect(screen.getByRole('link', { name: 'Create Account' })).toHaveAttribute('href', '/sign-up')
  })

  it("uses the gold commerce-CTA color for Create Account, not AI's purple", () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', role: null })
    renderDrawer()

    expect(screen.getByRole('link', { name: 'Create Account' }).className).toContain('bg-accent-gold')
  })

  it('keeps Sign Out reachable for a signed-in user', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'CUSTOMER' })
    renderDrawer()

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('shows Seller Studio for a SELLER and Admin Control Center for an ADMIN, in the real nav list', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'SELLER' })
    const { unmount } = renderDrawer()
    expect(screen.getByRole('link', { name: /Seller Studio/ })).toHaveAttribute('href', '/seller-studio')
    unmount()

    useAuth.mockReturnValue({ status: 'authenticated', role: 'ADMIN' })
    renderDrawer()
    expect(screen.getByRole('link', { name: /Admin Control Center/ })).toHaveAttribute('href', '/admin')
  })
})
