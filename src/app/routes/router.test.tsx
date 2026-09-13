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
// The real marketplace repository issues genuine Firestore getDocs()/
// getCountFromServer() calls — both stubbed here the same way every other
// lazy-loaded route in this file avoids touching the real SDK, so this file
// only proves the route wires up and renders, not marketplace query
// behavior (see marketplaceRepository's own dedicated tests for that).
// getCountFromServer specifically (added for Explore's real category
// counts, UI-01) was a real gap here: left unmocked, it reaches the actual
// Firestore SDK against the fake `db: {}` below, which never resolves
// within a test's lifetime — a real incident, not a hypothetical, caught by
// the /explore direct-navigation test hanging until timeout.
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return {
    ...actual,
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
    getCountFromServer: vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) }),
  }
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
    expect(await screen.findByText('Belong')).toBeInTheDocument()
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
    await screen.findByText('Belong')

    // "Create Account" (an owner-requested wording/color correction this
    // round — see AppTopBar.tsx) — same real /sign-up route as always.
    fireEvent.click(screen.getAllByRole('link', { name: 'Create Account' })[0])

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
    await screen.findByText('Belong')

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

  // UI-01's Explore rebuild made this page's first render heavier than the
  // other lazy routes in this file: it now fires three concurrent queries on
  // mount (recentQuery + activeQuery in MarketplacePage, plus MarketplaceGrid's
  // own copy of activeQuery's key, all TanStack-cache-shared but each still
  // awaiting its mocked async Firestore call) plus useArtistDisplayNames. On
  // this environment that genuinely pushed real render time past both the
  // 3000ms findByRole timeout every other test in this file uses AND, once
  // that was raised, past Vitest's own 5000ms default per-test timeout —
  // confirmed via the literal "Test timed out in 5000ms" error, not a
  // TestingLibraryElementError, once the assertion's own timeout was no
  // longer the bottleneck. Both timeouts are widened here; this is slower,
  // correct rendering, not a hang (see the SPA-link-navigation test just
  // below, which reaches an already-mounted instance of the same page and
  // passes on the default budget).
  it(
    'lazy-loads the real Marketplace page on direct navigation to "/explore", without requiring authentication (Module 08)',
    async () => {
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

      expect(await screen.findByRole('heading', { name: 'Art without boundaries' }, { timeout: 8000 })).toBeInTheDocument()
      expect(screen.queryByText(/sign in/i, { selector: 'h1,h2,p' })).not.toBeInTheDocument()
    },
    10000,
  )

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
    await screen.findByText('Belong')

    fireEvent.click(screen.getAllByRole('link', { name: 'Explore' })[0])

    expect(await screen.findByRole('heading', { name: 'Art without boundaries' }, { timeout: 3000 })).toBeInTheDocument()
  })

  // UI-01 mobile correction: Categories was removed as a duplicate of
  // Explore's own category discovery — /categories now redirects rather than
  // rendering its own page, so any bookmarked/shared link still lands
  // somewhere real instead of breaking outright.
  it(
    'redirects "/categories" to "/explore" (Categories removed as a duplicate of Explore)',
    async () => {
      render(
        <AppProviders>
          <AuthProvider>
            <WishlistProvider>
              <RouterProvider router={router} />
            </WishlistProvider>
          </AuthProvider>
        </AppProviders>,
      )
      await router.navigate('/categories')

      // Same heavier-first-render budget as the direct-to-/explore test
      // above — this redirect lands on the exact same page.
      expect(await screen.findByRole('heading', { name: 'Art without boundaries' }, { timeout: 8000 })).toBeInTheDocument()
    },
    10000,
  )

  // UI-01 — the router previously had no catch-all at all; this closes that gap.
  it('renders the 404 page (inside the normal app shell) for an unmatched route', async () => {
    render(
      <AppProviders>
        <AuthProvider>
          <WishlistProvider>
            <RouterProvider router={router} />
          </WishlistProvider>
        </AuthProvider>
      </AppProviders>,
    )
    await router.navigate('/this-route-does-not-exist')

    expect(await screen.findByText('Page not found', {}, { timeout: 3000 })).toBeInTheDocument()
    // Still inside AppShell, not a bare unstyled error — the brand mark renders.
    expect(document.querySelectorAll('[aria-label="ArtVault"]').length).toBeGreaterThan(0)
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
