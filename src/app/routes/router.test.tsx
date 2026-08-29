import { render, screen } from '@testing-library/react'
import { RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/app/providers/AuthProvider'
import { router } from '@/app/routes/router'

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null } }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: null) => void) => {
    callback(null)
    return () => {}
  },
  getIdTokenResult: vi.fn(),
}))

describe('router', () => {
  it('renders the root layout and the home page at "/" for a signed-out visitor', async () => {
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    )

    expect(await screen.findByText('ArtVault')).toBeInTheDocument()
    expect(await screen.findByText('ArtVault foundation is running')).toBeInTheDocument()
    expect(screen.getByText('Sign in')).toBeInTheDocument()
  })
})
