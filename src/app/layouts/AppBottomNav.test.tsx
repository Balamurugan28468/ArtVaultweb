import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppBottomNav } from './AppBottomNav'

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

function renderBottomNav() {
  return render(
    <MemoryRouter>
      <AppBottomNav />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAuth.mockReset()
})

// UI-01 mobile correction: the bottom nav previously grew one tab per
// role-gated item that became available, reaching 5-6+ tabs for a SELLER or
// ADMIN. This is capped at exactly 5 primary tabs for every role now, with
// everything else moved into "More".
describe('AppBottomNav — max 5 primary tabs (regression coverage)', () => {
  it('shows exactly Home, Explore, Wishlist, Sign in, and More for a guest', () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', role: null })
    renderBottomNav()

    expect(screen.getAllByRole('link', { name: /Home/ }).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /Explore/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Wishlist/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Sign in/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /More/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Categories/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Account/ })).not.toBeInTheDocument()
  })

  it('shows exactly Home, Explore, Wishlist, Account, and More for a CUSTOMER — never 6+ tabs', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'CUSTOMER' })
    const { container } = renderBottomNav()

    expect(screen.getByRole('link', { name: /Account/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Sign in/ })).not.toBeInTheDocument()
    const primaryRow = container.querySelector('nav[aria-label="Primary"]')
    const tabs = primaryRow?.querySelectorAll(':scope > div > a, :scope > div > button') ?? []
    expect(tabs.length).toBe(5)
  })

  it('caps SELLER at 5 primary tabs too — Seller Studio moves into More, not the primary row', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'SELLER' })
    const { container } = renderBottomNav()

    expect(screen.queryByRole('link', { name: /Seller Studio/ })).not.toBeInTheDocument()
    const primaryRow = container.querySelector('nav[aria-label="Primary"]')
    const tabs = primaryRow?.querySelectorAll(':scope > div > a, :scope > div > button') ?? []
    expect(tabs.length).toBe(5)
  })

  it('caps ADMIN at 5 primary tabs too — Admin Control Center moves into More, not the primary row', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'ADMIN' })
    const { container } = renderBottomNav()

    expect(screen.queryByRole('link', { name: /Admin Control Center/ })).not.toBeInTheDocument()
    const primaryRow = container.querySelector('nav[aria-label="Primary"]')
    const tabs = primaryRow?.querySelectorAll(':scope > div > a, :scope > div > button') ?? []
    expect(tabs.length).toBe(5)
  })
})

describe('AppBottomNav — More menu', () => {
  it('opens to reveal Seller Studio (a real route) for a SELLER', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'SELLER' })
    renderBottomNav()

    fireEvent.click(screen.getByRole('button', { name: /More/ }))

    expect(screen.getByRole('link', { name: /Seller Studio/ })).toHaveAttribute('href', '/seller-studio')
  })

  it('opens to reveal Admin Control Center (a real route) for an ADMIN', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'ADMIN' })
    renderBottomNav()

    fireEvent.click(screen.getByRole('button', { name: /More/ }))

    expect(screen.getByRole('link', { name: /Admin Control Center/ })).toHaveAttribute('href', '/admin')
  })

  it('shows Auctions, Notifications, Cart, and Help as honestly disabled for a CUSTOMER — never fake working links', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'CUSTOMER' })
    renderBottomNav()

    fireEvent.click(screen.getByRole('button', { name: /More/ }))

    for (const label of ['Auctions', 'Notifications', 'Cart', 'Help']) {
      const el = screen.getByText(label)
      expect(el.closest('[aria-disabled="true"]')).not.toBeNull()
    }
    expect(screen.queryByRole('link', { name: /Cart/ })).not.toBeInTheDocument()
  })
})
