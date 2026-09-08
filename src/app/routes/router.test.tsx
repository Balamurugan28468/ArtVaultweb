import { fireEvent, render, screen } from '@testing-library/react'
import { RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/AppProviders'
import { AuthProvider } from '@/app/providers/AuthProvider'
import { router } from '@/app/routes/router'
import { WishlistProvider } from '@/features/wishlist'

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: null) => void) => {
    callback(null)
    return () => {}
  },
  getIdTokenResult: vi.fn(),
}))
// The real marketplace repository issues a genuine Firestore getDocs() call
// — stubbed here the same way every other lazy-loaded route in this file
// avoids touching the real SDK, so this file only proves the route wires up
// and renders, not marketplace query behavior (see marketplaceRepository's
// own dedicated tests for that).
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return { ...actual, getDocs: vi.fn().mockResolvedValue({ docs: [] }) }
})

// Every findByRole('heading', ...) below that follows a real lazy-load
// (dynamic import, exactly as in production — see the comment above the
// Sign Up test) passes an explicit longer timeout than the 1000ms default.
// This file forces a genuine dynamic import to resolve through the real
// router for every route it covers, and jsdom (much slower than a real
// browser at this) occasionally exceeds that default window under normal
// system load — confirmed, while diagnosing this for Module 10, to never
// reproduce in a real browser (each route's heading renders correctly and
// instantly there). The assertions themselves are unchanged.

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
      <AppProviders>
        <AuthProvider>
          <WishlistProvider>
            <RouterProvider router={router} />
          </WishlistProvider>
        </AuthProvider>
      </AppProviders>,
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
      <AppProviders>
        <AuthProvider>
          <WishlistProvider>
            <RouterProvider router={router} />
          </WishlistProvider>
        </AuthProvider>
      </AppProviders>,
    )
    await screen.findByText('Welcome to ArtVault')

    fireEvent.click(screen.getAllByRole('link', { name: 'Sign up' })[0])

    expect(await screen.findByRole('heading', { name: 'Create your account' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('lazy-loads the real Sign In page via SPA link navigation from Home', async () => {
    render(
      <AppProviders>
        <AuthProvider>
          <WishlistProvider>
            <RouterProvider router={router} />
          </WishlistProvider>
        </AuthProvider>
      </AppProviders>,
    )
    await screen.findByText('Welcome to ArtVault')

    fireEvent.click(screen.getAllByRole('link', { name: 'Sign in' })[0])

    expect(await screen.findByRole('heading', { name: 'Sign in' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('lazy-loads the real Sign Up page on direct navigation to "/sign-up"', async () => {
    render(
      <AppProviders>
        <AuthProvider>
          <WishlistProvider>
            <RouterProvider router={router} />
          </WishlistProvider>
        </AuthProvider>
      </AppProviders>,
    )
    await router.navigate('/sign-up')

    expect(await screen.findByRole('heading', { name: 'Create your account' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('lazy-loads the real Sign In page on direct navigation to "/sign-in"', async () => {
    render(
      <AppProviders>
        <AuthProvider>
          <WishlistProvider>
            <RouterProvider router={router} />
          </WishlistProvider>
        </AuthProvider>
      </AppProviders>,
    )
    await router.navigate('/sign-in')

    expect(await screen.findByRole('heading', { name: 'Sign in' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('lazy-loads the real Marketplace page on direct navigation to "/explore", without requiring authentication (Module 08)', async () => {
    render(
      <AppProviders>
        <AuthProvider>
          <WishlistProvider>
            <RouterProvider router={router} />
          </WishlistProvider>
        </AuthProvider>
      </AppProviders>,
    )
    await router.navigate('/explore')

    expect(await screen.findByRole('heading', { name: 'Explore' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByText(/sign in/i, { selector: 'h1,h2,p' })).not.toBeInTheDocument()
  })

  it('reaches the real Marketplace page via SPA link navigation from Home', async () => {
    render(
      <AppProviders>
        <AuthProvider>
          <WishlistProvider>
            <RouterProvider router={router} />
          </WishlistProvider>
        </AuthProvider>
      </AppProviders>,
    )
    await screen.findByText('Welcome to ArtVault')

    fireEvent.click(screen.getAllByRole('link', { name: 'Explore' })[0])

    expect(await screen.findByRole('heading', { name: 'Explore' }, { timeout: 3000 })).toBeInTheDocument()
  })

  it('lazy-loads the real Wishlist page on direct navigation to "/wishlist", without requiring authentication (Module 09)', async () => {
    render(
      <AppProviders>
        <AuthProvider>
          <WishlistProvider>
            <RouterProvider router={router} />
          </WishlistProvider>
        </AuthProvider>
      </AppProviders>,
    )
    await router.navigate('/wishlist')

    expect(await screen.findByRole('heading', { name: 'Wishlist' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByText(/sign in/i, { selector: 'h1,h2,p' })).not.toBeInTheDocument()
  })
})
