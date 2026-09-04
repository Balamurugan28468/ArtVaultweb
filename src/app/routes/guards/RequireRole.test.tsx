import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { RequireRole } from './RequireRole'

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

function renderGuardedRoute() {
  const router = createMemoryRouter(
    [
      { path: '/account', element: <p>Account page</p> },
      {
        element: <RequireRole allow={['SELLER']} />,
        children: [{ path: '/seller-studio', element: <p>Seller Studio</p> }],
      },
    ],
    { initialEntries: ['/seller-studio'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('RequireRole', () => {
  it('renders the protected content for an authorized role', () => {
    useAuth.mockReturnValue({ role: 'SELLER' })
    renderGuardedRoute()
    expect(screen.getByText('Seller Studio')).toBeInTheDocument()
  })

  it('redirects a CUSTOMER away to /account', () => {
    useAuth.mockReturnValue({ role: 'CUSTOMER' })
    renderGuardedRoute()
    expect(screen.getByText('Account page')).toBeInTheDocument()
    expect(screen.queryByText('Seller Studio')).not.toBeInTheDocument()
  })

  it('redirects when role is not yet resolved (null)', () => {
    useAuth.mockReturnValue({ role: null })
    renderGuardedRoute()
    expect(screen.getByText('Account page')).toBeInTheDocument()
  })

  it('redirects an ADMIN who is not in the allow list', () => {
    useAuth.mockReturnValue({ role: 'ADMIN' })
    renderGuardedRoute()
    expect(screen.getByText('Account page')).toBeInTheDocument()
  })
})
