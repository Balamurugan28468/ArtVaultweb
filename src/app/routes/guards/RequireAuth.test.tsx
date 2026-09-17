import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { RequireAuth } from './RequireAuth'

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

function renderGuardedRoute() {
  const router = createMemoryRouter(
    [
      { path: '/sign-in', element: <p>Sign in page</p> },
      { element: <RequireAuth />, children: [{ path: '/protected', element: <p>Protected content</p> }] },
    ],
    { initialEntries: ['/protected'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('RequireAuth', () => {
  it('shows a loading state while the session is restoring', () => {
    useAuth.mockReturnValue({ status: 'loading' })
    renderGuardedRoute()
    expect(screen.getByText(/loading your session/i)).toBeInTheDocument()
  })

  it('redirects to sign-in when unauthenticated', () => {
    useAuth.mockReturnValue({ status: 'unauthenticated' })
    renderGuardedRoute()
    expect(screen.getByText('Sign in page')).toBeInTheDocument()
  })

  it('renders the protected content when authenticated', () => {
    useAuth.mockReturnValue({ status: 'authenticated' })
    renderGuardedRoute()
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })
})

it('retains the protected destination including search and hash', () => {
  useAuth.mockReturnValue({ status: 'unauthenticated' })
  const router = createMemoryRouter([
    { path: '/sign-in', element: <p>Sign in page</p> },
    { element: <RequireAuth />, children: [{ path: '/checkout', element: <p>Checkout</p> }] },
  ], { initialEntries: ['/checkout?step=address#shipping'] })
  render(<RouterProvider router={router} />)
  expect(router.state.location.state).toEqual({ from: '/checkout?step=address#shipping' })
})
