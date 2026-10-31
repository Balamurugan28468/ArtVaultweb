import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
import { RouterProvider } from 'react-router'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { AppProviders } from '@/app/providers/AppProviders'
import { AuthProvider } from '@/app/providers/AuthProvider'
import { router } from '@/app/routes/router'
import { CartProvider } from '@/features/cart'
import { WishlistProvider } from '@/features/wishlist'

const mocks = vi.hoisted(() => {
  const emptyResult = {
    data: [],
    error: null,
    count: 0,
  }

  const builder: Record<
    string,
    unknown
  > = {}

  const chainMethods = [
    'select',
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'in',
    'is',
    'or',
    'match',
    'order',
    'limit',
    'range',
    'filter',
  ]

  for (
    const method
    of chainMethods
  ) {
    builder[method] =
      vi.fn(
        () => builder,
      )
  }

  builder.maybeSingle =
    vi.fn(
      async () => ({
        data: null,
        error: null,
      }),
    )

  builder.single =
    vi.fn(
      async () => ({
        data: null,
        error: null,
      }),
    )

  builder.then = (
    onFulfilled:
      | ((
          value: typeof emptyResult,
        ) => unknown)
      | undefined,
    onRejected:
      | ((
          reason: unknown,
        ) => unknown)
      | undefined,
  ) =>
    Promise.resolve(
      emptyResult,
    ).then(
      onFulfilled,
      onRejected,
    )

  const unsubscribe =
    vi.fn()

  const auth = {
    getSession:
      vi.fn(
        async () => ({
          data: {
            session: null,
          },
          error: null,
        }),
      ),

    onAuthStateChange:
      vi.fn(
        () => ({
          data: {
            subscription: {
              unsubscribe,
            },
          },
        }),
      ),

    getUser:
      vi.fn(
        async () => ({
          data: {
            user: null,
          },
          error: null,
        }),
      ),
  }

  const from =
    vi.fn(
      () => builder,
    )

  const rpc =
    vi.fn(
      async () => ({
        data: null,
        error: null,
      }),
    )

  const storageBucket = {
    createSignedUrl:
      vi.fn(
        async () => ({
          data: {
            signedUrl: '',
          },
          error: null,
        }),
      ),

    upload:
      vi.fn(
        async () => ({
          data: null,
          error: null,
        }),
      ),

    remove:
      vi.fn(
        async () => ({
          data: [],
          error: null,
        }),
      ),
  }

  const storage = {
    from:
      vi.fn(
        () =>
          storageBucket,
      ),
  }

  const realtimeChannel: {
    on: ReturnType<typeof vi.fn>
    subscribe: ReturnType<typeof vi.fn>
  } = {
    on: vi.fn(),
    subscribe: vi.fn(),
  }

  realtimeChannel.on.mockReturnValue(
    realtimeChannel,
  )

  realtimeChannel.subscribe.mockReturnValue(
    realtimeChannel,
  )

  const channel =
    vi.fn(
      () =>
        realtimeChannel,
    )

  const removeChannel =
    vi.fn(
      async () =>
        undefined,
    )

  const supabase = {
    auth,
    from,
    rpc,
    storage,
    channel,
    removeChannel,
  }

  return {
    builder,
    auth,
    from,
    rpc,
    storage,
    storageBucket,
    channel,
    realtimeChannel,
    removeChannel,
    unsubscribe,
    supabase,
  }
})

vi.mock(
  '@/lib/supabase/client',
  () => ({
    createClient: () =>
      mocks.supabase,
  }),
)

beforeEach(() => {
  mocks.auth.getSession.mockClear()
  mocks.auth.onAuthStateChange.mockClear()
  mocks.auth.getUser.mockClear()

  mocks.from.mockClear()
  mocks.rpc.mockClear()

  mocks.storage.from.mockClear()
  mocks.storageBucket.createSignedUrl.mockClear()
  mocks.storageBucket.upload.mockClear()
  mocks.storageBucket.remove.mockClear()

  mocks.channel.mockClear()
  mocks.removeChannel.mockClear()
  mocks.unsubscribe.mockClear()
})

afterEach(async () => {
  await router.navigate('/')
})

describe(
  'router',
  () => {
    it('renders the root layout and home page for a signed-out Supabase visitor', async () => {
      const {
        container,
      } = render(
        <AppProviders>
          <AuthProvider>
            <WishlistProvider>
              <CartProvider>
                <RouterProvider
                  router={
                    router
                  }
                />
              </CartProvider>
            </WishlistProvider>
          </AuthProvider>
        </AppProviders>,
      )

      expect(
        await screen.findByText(
          'Belong',
        ),
      ).toBeInTheDocument()

      expect(
        container.querySelectorAll(
          '[aria-label="ArtVault"]',
        ).length,
      ).toBeGreaterThan(0)

      expect(
        screen.getAllByText(
          'Sign in',
        ).length,
      ).toBeGreaterThan(0)
    })

    it('lazy-loads the real Sign Up page through SPA navigation from Home', async () => {
      render(
        <AppProviders>
          <AuthProvider>
            <WishlistProvider>
              <CartProvider>
                <RouterProvider
                  router={
                    router
                  }
                />
              </CartProvider>
            </WishlistProvider>
          </AuthProvider>
        </AppProviders>,
      )

      await screen.findByText(
        'Belong',
      )

      fireEvent.click(
        screen.getAllByRole(
          'link',
          {
            name:
              'Create Account',
          },
        )[0],
      )

      expect(
        await screen.findByRole(
          'heading',
          {
            name:
              'Create your account',
          },
          {
            timeout: 3000,
          },
        ),
      ).toBeInTheDocument()

      expect(
        screen.getByLabelText(
          'Name',
        ),
      ).toBeInTheDocument()
    })

    it('lazy-loads the real Sign In page through SPA navigation from Home', async () => {
      render(
        <AppProviders>
          <AuthProvider>
            <WishlistProvider>
              <CartProvider>
                <RouterProvider
                  router={
                    router
                  }
                />
              </CartProvider>
            </WishlistProvider>
          </AuthProvider>
        </AppProviders>,
      )

      await screen.findByText(
        'Belong',
      )

      fireEvent.click(
        screen.getAllByRole(
          'link',
          {
            name: 'Sign in',
          },
        )[0],
      )

      expect(
        await screen.findByRole(
          'heading',
          {
            name: 'Sign in',
          },
          {
            timeout: 3000,
          },
        ),
      ).toBeInTheDocument()

      expect(
        screen.getByLabelText(
          'Email',
        ),
      ).toBeInTheDocument()
    })

    it('lazy-loads the real Sign Up page on direct navigation to "/sign-up"', async () => {
      render(
        <AppProviders>
          <AuthProvider>
            <WishlistProvider>
              <CartProvider>
                <RouterProvider
                  router={
                    router
                  }
                />
              </CartProvider>
            </WishlistProvider>
          </AuthProvider>
        </AppProviders>,
      )

      await router.navigate(
        '/sign-up',
      )

      expect(
        await screen.findByRole(
          'heading',
          {
            name:
              'Create your account',
          },
          {
            timeout: 3000,
          },
        ),
      ).toBeInTheDocument()

      expect(
        screen.getByLabelText(
          'Name',
        ),
      ).toBeInTheDocument()
    })

    it('lazy-loads the real Sign In page on direct navigation to "/sign-in"', async () => {
      render(
        <AppProviders>
          <AuthProvider>
            <WishlistProvider>
              <CartProvider>
                <RouterProvider
                  router={
                    router
                  }
                />
              </CartProvider>
            </WishlistProvider>
          </AuthProvider>
        </AppProviders>,
      )

      await router.navigate(
        '/sign-in',
      )

      expect(
        await screen.findByRole(
          'heading',
          {
            name: 'Sign in',
          },
          {
            timeout: 3000,
          },
        ),
      ).toBeInTheDocument()

      expect(
        screen.getByLabelText(
          'Email',
        ),
      ).toBeInTheDocument()
    })

    it(
      'lazy-loads the real Marketplace page on direct navigation to "/explore" without authentication',
      async () => {
        render(
          <AppProviders>
            <AuthProvider>
              <WishlistProvider>
                <CartProvider>
                  <RouterProvider
                    router={
                      router
                    }
                  />
                </CartProvider>
              </WishlistProvider>
            </AuthProvider>
          </AppProviders>,
        )

        await router.navigate(
          '/explore',
        )

        expect(
          await screen.findByRole(
            'heading',
            {
              name:
                'Art without boundaries',
            },
            {
              timeout: 8000,
            },
          ),
        ).toBeInTheDocument()

        expect(
          screen.queryByText(
            /sign in/i,
            {
              selector:
                'h1,h2,p',
            },
          ),
        ).not.toBeInTheDocument()
      },
      10000,
    )

    it('reaches the real Marketplace page through SPA navigation from Home', async () => {
      render(
        <AppProviders>
          <AuthProvider>
            <WishlistProvider>
              <CartProvider>
                <RouterProvider
                  router={
                    router
                  }
                />
              </CartProvider>
            </WishlistProvider>
          </AuthProvider>
        </AppProviders>,
      )

      await screen.findByText(
        'Belong',
      )

      fireEvent.click(
        screen.getAllByRole(
          'link',
          {
            name: 'Explore',
          },
        )[0],
      )

      expect(
        await screen.findByRole(
          'heading',
          {
            name:
              'Art without boundaries',
          },
          {
            timeout: 8000,
          },
        ),
      ).toBeInTheDocument()
    })

    it(
      'redirects "/categories" to "/explore"',
      async () => {
        render(
          <AppProviders>
            <AuthProvider>
              <WishlistProvider>
                <CartProvider>
                  <RouterProvider
                    router={
                      router
                    }
                  />
                </CartProvider>
              </WishlistProvider>
            </AuthProvider>
          </AppProviders>,
        )

        await router.navigate(
          '/categories',
        )

        expect(
          await screen.findByRole(
            'heading',
            {
              name:
                'Art without boundaries',
            },
            {
              timeout: 8000,
            },
          ),
        ).toBeInTheDocument()
      },
      10000,
    )

    it('renders the 404 page inside the normal app shell for an unmatched route', async () => {
      render(
        <AppProviders>
          <AuthProvider>
            <WishlistProvider>
              <CartProvider>
                <RouterProvider
                  router={
                    router
                  }
                />
              </CartProvider>
            </WishlistProvider>
          </AuthProvider>
        </AppProviders>,
      )

      await router.navigate(
        '/this-route-does-not-exist',
      )

      expect(
        await screen.findByText(
          'Page not found',
          {},
          {
            timeout: 3000,
          },
        ),
      ).toBeInTheDocument()

      expect(
        document.querySelectorAll(
          '[aria-label="ArtVault"]',
        ).length,
      ).toBeGreaterThan(0)
    })

    it('lazy-loads the real Wishlist page without requiring authentication', async () => {
      render(
        <AppProviders>
          <AuthProvider>
            <WishlistProvider>
              <CartProvider>
                <RouterProvider
                  router={
                    router
                  }
                />
              </CartProvider>
            </WishlistProvider>
          </AuthProvider>
        </AppProviders>,
      )

      await router.navigate(
        '/wishlist',
      )

      expect(
        await screen.findByRole(
          'heading',
          {
            name: 'Wishlist',
          },
          {
            timeout: 3000,
          },
        ),
      ).toBeInTheDocument()

      expect(
        screen.queryByText(
          /sign in/i,
          {
            selector:
              'h1,h2,p',
          },
        ),
      ).not.toBeInTheDocument()
    })

    it('lazy-loads the real Cart page without requiring authentication', async () => {
      render(
        <AppProviders>
          <AuthProvider>
            <WishlistProvider>
              <CartProvider>
                <RouterProvider
                  router={
                    router
                  }
                />
              </CartProvider>
            </WishlistProvider>
          </AuthProvider>
        </AppProviders>,
      )

      await router.navigate(
        '/cart',
      )

      expect(
        await screen.findByRole(
          'heading',
          {
            name: 'Cart',
          },
          {
            timeout: 3000,
          },
        ),
      ).toBeInTheDocument()

      expect(
        screen.queryByText(
          /sign in/i,
          {
            selector:
              'h1,h2,p',
          },
        ),
      ).not.toBeInTheDocument()
    })

    it('redirects "/checkout" to "/sign-in" for a signed-out Supabase visitor', async () => {
      render(
        <AppProviders>
          <AuthProvider>
            <WishlistProvider>
              <CartProvider>
                <RouterProvider
                  router={
                    router
                  }
                />
              </CartProvider>
            </WishlistProvider>
          </AuthProvider>
        </AppProviders>,
      )

      await router.navigate(
        '/checkout',
      )

      expect(
        await screen.findByRole(
          'heading',
          {
            name: 'Sign in',
          },
          {
            timeout: 3000,
          },
        ),
      ).toBeInTheDocument()
    })

    it('redirects "/orders" to "/sign-in" for a signed-out Supabase visitor', async () => {
      render(
        <AppProviders>
          <AuthProvider>
            <WishlistProvider>
              <CartProvider>
                <RouterProvider
                  router={
                    router
                  }
                />
              </CartProvider>
            </WishlistProvider>
          </AuthProvider>
        </AppProviders>,
      )

      await router.navigate(
        '/orders',
      )

      expect(
        await screen.findByRole(
          'heading',
          {
            name: 'Sign in',
          },
          {
            timeout: 3000,
          },
        ),
      ).toBeInTheDocument()
    })

    it('redirects "/orders/some-id" to "/sign-in" for a signed-out Supabase visitor', async () => {
      render(
        <AppProviders>
          <AuthProvider>
            <WishlistProvider>
              <CartProvider>
                <RouterProvider
                  router={
                    router
                  }
                />
              </CartProvider>
            </WishlistProvider>
          </AuthProvider>
        </AppProviders>,
      )

      await router.navigate(
        '/orders/some-id',
      )

      expect(
        await screen.findByRole(
          'heading',
          {
            name: 'Sign in',
          },
          {
            timeout: 3000,
          },
        ),
      ).toBeInTheDocument()
    })

    it('redirects "/account/addresses" to "/sign-in" for a signed-out Supabase visitor', async () => {
      render(
        <AppProviders>
          <AuthProvider>
            <WishlistProvider>
              <CartProvider>
                <RouterProvider
                  router={
                    router
                  }
                />
              </CartProvider>
            </WishlistProvider>
          </AuthProvider>
        </AppProviders>,
      )

      await router.navigate(
        '/account/addresses',
      )

      expect(
        await screen.findByRole(
          'heading',
          {
            name: 'Sign in',
          },
          {
            timeout: 3000,
          },
        ),
      ).toBeInTheDocument()
    })

    it('redirects "/seller-studio" to "/sign-in" for a signed-out Supabase visitor', async () => {
      render(
        <AppProviders>
          <AuthProvider>
            <WishlistProvider>
              <CartProvider>
                <RouterProvider
                  router={
                    router
                  }
                />
              </CartProvider>
            </WishlistProvider>
          </AuthProvider>
        </AppProviders>,
      )

      await router.navigate(
        '/seller-studio',
      )

      expect(
        await screen.findByRole(
          'heading',
          {
            name: 'Sign in',
          },
          {
            timeout: 3000,
          },
        ),
      ).toBeInTheDocument()
    })
  },
)