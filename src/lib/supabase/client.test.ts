import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const sdk = vi.hoisted(() => ({
  createClient: vi.fn(
    () => ({
      auth: {},
    }),
  ),
}))

vi.mock(
  '@supabase/supabase-js',
  () => sdk,
)

beforeEach(() => {
  vi.resetModules()
  sdk.createClient.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe(
  'Supabase SPA client foundation',
  () => {
    it('does not create a client merely by importing the module', async () => {
      await import('./client')

      expect(
        sdk.createClient,
      ).not.toHaveBeenCalled()
    })

    it('creates exactly one browser client with persistent Supabase Auth configuration', async () => {
      vi.stubEnv(
        'VITE_SUPABASE_URL',
        'https://example.supabase.co',
      )

      vi.stubEnv(
        'VITE_SUPABASE_PUBLISHABLE_KEY',
        'sb_publishable_test',
      )

      const {
        createClient,
      } = await import(
        './client'
      )

      expect(
        createClient(),
      ).toBe(
        createClient(),
      )

      expect(
        sdk.createClient,
      ).toHaveBeenCalledExactlyOnceWith(
        'https://example.supabase.co',
        'sb_publishable_test',
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
          },
        },
      )
    })

    it('rejects a missing publishable browser key', async () => {
      vi.stubEnv(
        'VITE_SUPABASE_URL',
        'https://example.supabase.co',
      )

      vi.stubEnv(
        'VITE_SUPABASE_PUBLISHABLE_KEY',
        '',
      )

      const {
        createClient,
      } = await import(
        './client'
      )

      expect(
        () => createClient(),
      ).toThrow(
        'Missing VITE_SUPABASE_PUBLISHABLE_KEY',
      )

      expect(
        sdk.createClient,
      ).not.toHaveBeenCalled()
    })

    it.each([
      'sb_secret_not_allowed',
      'legacy-service-role-token',
    ])(
      'rejects a non-publishable browser key: %s',
      async (key) => {
        vi.stubEnv(
          'VITE_SUPABASE_URL',
          'https://example.supabase.co',
        )

        vi.stubEnv(
          'VITE_SUPABASE_PUBLISHABLE_KEY',
          key,
        )

        const {
          createClient,
        } = await import(
          './client'
        )

        expect(
          () => createClient(),
        ).toThrow(
          'publishable browser key',
        )

        expect(
          sdk.createClient,
        ).not.toHaveBeenCalled()
      },
    )

    it('rejects a non-HTTPS Supabase URL', async () => {
      vi.stubEnv(
        'VITE_SUPABASE_URL',
        'http://example.supabase.co',
      )

      vi.stubEnv(
        'VITE_SUPABASE_PUBLISHABLE_KEY',
        'sb_publishable_test',
      )

      const {
        createClient,
      } = await import(
        './client'
      )

      expect(
        () => createClient(),
      ).toThrow(
        'Supabase URL must use HTTPS.',
      )

      expect(
        sdk.createClient,
      ).not.toHaveBeenCalled()
    })

    it('rejects a Supabase URL containing embedded credentials', async () => {
      vi.stubEnv(
        'VITE_SUPABASE_URL',
        'https://user:password@example.supabase.co',
      )

      vi.stubEnv(
        'VITE_SUPABASE_PUBLISHABLE_KEY',
        'sb_publishable_test',
      )

      const {
        createClient,
      } = await import(
        './client'
      )

      expect(
        () => createClient(),
      ).toThrow(
        'Supabase URL must not contain credentials.',
      )

      expect(
        sdk.createClient,
      ).not.toHaveBeenCalled()
    })
  },
)

it('isolates registration in memory from persistent application sessions and auth events', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
  const { createClient, createRegistrationClient } = await import('./client')
  const application = createClient()
  const registration = createRegistrationClient()
  expect(registration).not.toBe(application)
  expect(createRegistrationClient()).toBe(registration)
  expect(sdk.createClient).toHaveBeenCalledTimes(2)
  expect(sdk.createClient).toHaveBeenLastCalledWith('https://example.supabase.co', 'sb_publishable_test', {
    auth: { storageKey: 'artvault-registration', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
})
