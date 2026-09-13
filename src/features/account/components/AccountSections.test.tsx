import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountSections } from './AccountSections'

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

const useSellerStatus = vi.fn()
vi.mock('@/features/seller-studio', () => ({ useSellerStatus: () => useSellerStatus() }))

beforeEach(() => {
  useAuth.mockReturnValue({ role: 'CUSTOMER' })
})

function renderWithRouter() {
  return render(
    <MemoryRouter>
      <AccountSections />
    </MemoryRouter>,
  )
}

describe('AccountSections', () => {
  it('renders every still-unimplemented future section as a genuinely disabled, non-interactive control', () => {
    useSellerStatus.mockReturnValue({ status: 'not-applied' })
    renderWithRouter()

    for (const label of ['Addresses', 'Payment methods', 'Notifications', 'Security', 'Reviews', 'Settings']) {
      const button = screen.getByRole('button', { name: new RegExp(label) })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('aria-disabled', 'true')
    }
  })

  // UI-02: Orders and Wishlist became real, working entries (previously
  // disabled placeholders); Sign out is a new real entry too. Seller
  // Studio/"Become a seller" was already the one real entry before this.
  it('renders exactly the real links this role should see: seller entry, Orders, and Wishlist', () => {
    useSellerStatus.mockReturnValue({ status: 'not-applied' })
    renderWithRouter()

    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(3)
    expect(screen.getByRole('link', { name: /become a seller/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Orders/ })).toHaveAttribute('href', '/orders')
    expect(screen.getByRole('link', { name: /Wishlist/ })).toHaveAttribute('href', '/wishlist')
  })

  it('renders a real, working Sign out control', () => {
    useSellerStatus.mockReturnValue({ status: 'not-applied' })
    renderWithRouter()

    const signOut = screen.getByRole('button', { name: 'Sign out' })
    expect(signOut).not.toBeDisabled()
  })

  it('hides the Orders tile for ADMIN and SUPER_ADMIN — no commerce identity to order with — but still shows Wishlist (available to every role)', () => {
    useAuth.mockReturnValue({ role: 'ADMIN' })
    useSellerStatus.mockReturnValue({ status: 'not-applied' })
    renderWithRouter()

    expect(screen.queryByRole('link', { name: /Orders/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Wishlist/ })).toHaveAttribute('href', '/wishlist')
  })

  it('shows the Orders tile for a SELLER too', () => {
    useAuth.mockReturnValue({ role: 'SELLER' })
    useSellerStatus.mockReturnValue({ status: 'approved', application: { businessName: 'Test Gallery' } })
    renderWithRouter()

    expect(screen.getByRole('link', { name: /Orders/ })).toHaveAttribute('href', '/orders')
  })

  it('shows "Become a seller" linking to the application form when never applied', () => {
    useSellerStatus.mockReturnValue({ status: 'not-applied' })
    renderWithRouter()

    const link = screen.getByRole('link', { name: /become a seller/i })
    expect(link).toHaveAttribute('href', '/seller/apply')
  })

  it('still links to the application/status page while pending, with honest "pending" copy — never implying approval', () => {
    useSellerStatus.mockReturnValue({
      status: 'pending',
      application: { businessName: 'Test Gallery' },
    })
    renderWithRouter()

    const link = screen.getByRole('link', { name: /become a seller/i })
    expect(link).toHaveAttribute('href', '/seller/apply')
    expect(screen.getByText(/pending review/i)).toBeInTheDocument()
  })

  it('still links to the application/status page while rejected, with honest "not approved" copy — never implying the seller can just reapply', () => {
    useSellerStatus.mockReturnValue({
      status: 'rejected',
      application: { businessName: 'Test Gallery', rejectionReason: 'x' },
    })
    renderWithRouter()

    const link = screen.getByRole('link', { name: /become a seller/i })
    expect(link).toHaveAttribute('href', '/seller/apply')
    expect(screen.getByText(/application not approved/i)).toBeInTheDocument()
  })

  it('links to Seller Studio once approved', () => {
    useSellerStatus.mockReturnValue({
      status: 'approved',
      application: { businessName: 'Test Gallery' },
    })
    renderWithRouter()

    const link = screen.getByRole('link', { name: /seller studio/i })
    expect(link).toHaveAttribute('href', '/seller-studio')
  })

  it('an approved seller clicking the seller entry actually navigates to /seller-studio, never /seller/apply', () => {
    useSellerStatus.mockReturnValue({
      status: 'approved',
      application: { businessName: 'Test Gallery' },
    })
    render(
      <MemoryRouter initialEntries={['/account']}>
        <Routes>
          <Route path="/account" element={<AccountSections />} />
          <Route path="/seller-studio" element={<p>Seller Studio page</p>} />
          <Route path="/seller/apply" element={<p>Seller application page</p>} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('link', { name: /seller studio/i }))

    expect(screen.getByText('Seller Studio page')).toBeInTheDocument()
    expect(screen.queryByText('Seller application page')).not.toBeInTheDocument()
  })

  it('shows a non-interactive placeholder while seller status is loading — never a premature seller link', () => {
    useSellerStatus.mockReturnValue({ status: 'loading' })
    renderWithRouter()

    expect(screen.queryByRole('link', { name: /become a seller|seller studio/i })).not.toBeInTheDocument()
  })

  it('shows a non-interactive placeholder if seller status fails to load, rather than a broken link', () => {
    useSellerStatus.mockReturnValue({ status: 'error', error: { code: 'unknown', message: 'boom' } })
    renderWithRouter()

    expect(screen.queryByRole('link', { name: /become a seller|seller studio/i })).not.toBeInTheDocument()
  })

  it('never shows "Become a seller" (or any seller entry) for an ADMIN, even with no seller application at all', () => {
    useAuth.mockReturnValue({ role: 'ADMIN' })
    useSellerStatus.mockReturnValue({ status: 'not-applied' })
    renderWithRouter()

    expect(screen.queryByText(/become a seller/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /become a seller|seller studio/i })).not.toBeInTheDocument()
  })

  it('never shows "Become a seller" for a SUPER_ADMIN', () => {
    useAuth.mockReturnValue({ role: 'SUPER_ADMIN' })
    useSellerStatus.mockReturnValue({ status: 'not-applied' })
    renderWithRouter()

    expect(screen.queryByText(/become a seller/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /become a seller|seller studio/i })).not.toBeInTheDocument()
  })
})
