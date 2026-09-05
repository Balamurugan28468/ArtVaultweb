import { fireEvent, render, screen } from '@testing-library/react'
import { RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

// `router` is a module-level singleton (createBrowserRouter is only ever
// meant to be constructed once) shared across every test in this file, so
// each test explicitly navigates back to "/" first rather than assuming a
// clean starting location left over from a previous test.
afterEach(async () => {
  await router.navigate('/')
})

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

  // Regression coverage for a real incident: the Sign Up/Sign In routes are
  // wired through router.tsx's own `lazy(() => import(...))`, exactly as in
  // production — unlike a test that imports/renders SignInPage/SignUpPage
  // directly, this actually forces that dynamic import to resolve through
  // the real router, so a wrong path, a mismatched named export, or a
  // circular-import failure inside either page would fail here.
  it('lazy-loads the real Sign Up page via SPA link navigation from Home', async () => {
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    )
    await screen.findByText('Welcome to ArtVault')

    fireEvent.click(screen.getAllByRole('link', { name: 'Sign up' })[0])

    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('lazy-loads the real Sign In page via SPA link navigation from Home', async () => {
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    )
    await screen.findByText('Welcome to ArtVault')

    fireEvent.click(screen.getAllByRole('link', { name: 'Sign in' })[0])

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('lazy-loads the real Sign Up page on direct navigation to "/sign-up"', async () => {
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    )
    await router.navigate('/sign-up')

    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('lazy-loads the real Sign In page on direct navigation to "/sign-in"', async () => {
    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    )
    await router.navigate('/sign-in')

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })
})
