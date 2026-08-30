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
    const { container } = render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    )

    // BrandLogo's wordmark visually splits "Art"/"Vault" across nested
    // elements (for the two-tone brand color), which the default
    // getByText string matcher can't reassemble — check the accessible
    // name via aria-label instead, which is the authoritative one anyway.
    expect(await screen.findByText('Welcome to ArtVault')).toBeInTheDocument()
    expect(container.querySelectorAll('[aria-label="ArtVault"]').length).toBeGreaterThan(0)
    // Both the top bar and the mobile bottom nav render a "Sign in" entry
    // by design (see AppTopBar/AppBottomNav) — assert at least one exists
    // rather than assuming a single match.
    expect(screen.getAllByText('Sign in').length).toBeGreaterThan(0)
  })
})
