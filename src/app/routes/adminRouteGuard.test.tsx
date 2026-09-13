import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { RequireAuth } from './guards/RequireAuth'
import { RequireRole } from './guards/RequireRole'

/**
 * Module 13 Phase 3 — proves the exact `/admin` nesting router.tsx actually
 * uses (RequireAuth wrapping RequireRole(['ADMIN', 'SUPER_ADMIN'])), not
 * just RequireRole in isolation (see RequireRole.test.tsx for the generic
 * guard-mechanism matrix). This is UX/redirect coverage only — the real
 * authority for every privileged write is
 * functions/src/adminActions.ts's requireAdminCaller, which independently
 * re-derives the caller's role from the verified ID token on every call,
 * and firestore.rules' own Module 13 Phase 3 read grant for the two
 * review queues.
 */

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

function renderAdminRoute() {
  const router = createMemoryRouter(
    [
      { path: '/sign-in', element: <p>Sign in page</p> },
      { path: '/account', element: <p>Account page</p> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <RequireRole allow={['ADMIN', 'SUPER_ADMIN']} />,
            children: [{ path: '/admin', element: <p>Admin Control Center</p> }],
          },
        ],
      },
    ],
    { initialEntries: ['/admin'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('/admin route guard', () => {
  it('redirects a signed-out visitor to sign-in', () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', role: null })
    renderAdminRoute()
    expect(screen.getByText('Sign in page')).toBeInTheDocument()
    expect(screen.queryByText('Admin Control Center')).not.toBeInTheDocument()
  })

  it('shows a loading state while the session is still resolving, never the admin page early', () => {
    useAuth.mockReturnValue({ status: 'loading', role: null })
    renderAdminRoute()
    expect(screen.queryByText('Admin Control Center')).not.toBeInTheDocument()
  })

  it('denies a CUSTOMER, redirecting to /account', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'CUSTOMER' })
    renderAdminRoute()
    expect(screen.getByText('Account page')).toBeInTheDocument()
    expect(screen.queryByText('Admin Control Center')).not.toBeInTheDocument()
  })

  it('denies a SELLER, redirecting to /account', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'SELLER' })
    renderAdminRoute()
    expect(screen.getByText('Account page')).toBeInTheDocument()
    expect(screen.queryByText('Admin Control Center')).not.toBeInTheDocument()
  })

  it('allows an ADMIN', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'ADMIN' })
    renderAdminRoute()
    expect(screen.getByText('Admin Control Center')).toBeInTheDocument()
  })

  it('allows a SUPER_ADMIN', () => {
    useAuth.mockReturnValue({ status: 'authenticated', role: 'SUPER_ADMIN' })
    renderAdminRoute()
    expect(screen.getByText('Admin Control Center')).toBeInTheDocument()
  })
})
