import {
  act,
  render,
  screen,
} from '@testing-library/react'
import type {
  AuthChangeEvent,
  Session,
} from '@supabase/supabase-js'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  AuthProvider,
  useAuth,
} from './AuthProvider'

type AuthStateCallback = (
  event: AuthChangeEvent,
  session: Session | null,
) => void

const mocks = vi.hoisted(() => {
  const getAccountStatus = vi.fn()
  const signOut = vi.fn()
  const getSession = vi.fn()
  const onAuthStateChange = vi.fn()
  const unsubscribe = vi.fn()

  const ensureUserProfile = vi.fn()
  const waitForRoleClaim = vi.fn()
  const getCurrentRoleClaim = vi.fn()

  const mapSupabaseUser = vi.fn(
    (user: {
      email_confirmed_at: '2026-10-20T00:00:00Z',
      id: string
      email?: string
    }) => ({
      id: user.id,
      uid: user.id,
      email: user.email ?? null,
      displayName: null,
      photoURL: null,
      phoneNumber: null,
      emailVerified: true,
      createdAt: null,
    }),
  )

  const supabase = {
    auth: {
      signOut,
      getSession,
      onAuthStateChange,
    },
  }

  return {
    getAccountStatus,
    signOut,
    getSession,
    onAuthStateChange,
    unsubscribe,
    ensureUserProfile,
    waitForRoleClaim,
    getCurrentRoleClaim,
    mapSupabaseUser,
    supabase,
  }
})

vi.mock('@/features/auth/api/accountAccess', () => ({ getAccountStatus: mocks.getAccountStatus }))

vi.mock(
  '@/lib/supabase/client',
  () => ({
    createClient: () =>
      mocks.supabase,
  }),
)

vi.mock(
  '@/features/auth/api/ensureUserProfile',
  () => ({
    ensureUserProfile:
      mocks.ensureUserProfile,
  }),
)

vi.mock(
  '@/features/auth/api/roleClaim',
  () => ({
    waitForRoleClaim:
      mocks.waitForRoleClaim,

    getCurrentRoleClaim:
      mocks.getCurrentRoleClaim,
  }),
)

vi.mock(
  '@/features/auth/api/userMapper',
  () => ({
    mapSupabaseUser:
      mocks.mapSupabaseUser,
  }),
)

let authStateCallback:
  | AuthStateCallback
  | undefined

function makeSession(
  id = 'alice',
): Session {
  return {
    user: {
      email_confirmed_at: '2026-10-20T00:00:00Z',
      id,
      email: `${id}@example.com`,
    },
  } as unknown as Session
}

function Probe() {
  const {
    status,
    role,
    user,
  } = useAuth()

  return (
    <div>
      <p>
        {status}:{role ?? 'none'}
      </p>

      <p data-testid="user-id">
        {user?.id ?? 'none'}
      </p>
    </div>
  )
}

beforeEach(() => {
  mocks.getAccountStatus.mockReset().mockResolvedValue('ACTIVE')
  mocks.signOut.mockReset().mockResolvedValue({ error: null })
  authStateCallback = undefined

  mocks.getSession.mockReset()
  mocks.onAuthStateChange.mockReset()
  mocks.unsubscribe.mockReset()

  mocks.ensureUserProfile.mockReset()
  mocks.waitForRoleClaim.mockReset()
  mocks.getCurrentRoleClaim.mockReset()
  mocks.mapSupabaseUser.mockClear()

  mocks.ensureUserProfile.mockResolvedValue(
    undefined,
  )

  mocks.waitForRoleClaim.mockResolvedValue(
    'CUSTOMER',
  )

  mocks.getCurrentRoleClaim.mockResolvedValue(
    'CUSTOMER',
  )

  mocks.onAuthStateChange.mockImplementation(
    (
      callback: AuthStateCallback,
    ) => {
      authStateCallback = callback

      return {
        data: {
          subscription: {
            unsubscribe:
              mocks.unsubscribe,
          },
        },
      }
    },
  )

  vi.spyOn(
    console,
    'error',
  ).mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('does not carry an ADMIN role into a new customer session while identity is pending', async () => {
  mocks.getSession.mockResolvedValueOnce({ data: { session: makeSession('admin') }, error: null })
  mocks.waitForRoleClaim.mockResolvedValueOnce('ADMIN').mockResolvedValueOnce('CUSTOMER')
  let releaseAccountStatus: ((status: string) => void) | undefined
  mocks.getAccountStatus.mockResolvedValueOnce('ACTIVE').mockImplementationOnce(
    () => new Promise<string>(resolve => { releaseAccountStatus = resolve }),
  )
  render(<AuthProvider><Probe /></AuthProvider>)
  expect(await screen.findByText('authenticated:ADMIN')).toBeInTheDocument()
  act(() => { authStateCallback?.('SIGNED_IN', makeSession('customer')) })
  expect(await screen.findByText('loading:none')).toBeInTheDocument()
  expect(screen.getByTestId('user-id')).toHaveTextContent('none')
  await act(async () => { releaseAccountStatus?.('ACTIVE') })
  expect(await screen.findByText('authenticated:CUSTOMER')).toBeInTheDocument()
  expect(screen.getByTestId('user-id')).toHaveTextContent('customer')
})

it('ignores a stale initial getSession snapshot after SIGNED_OUT', async () => {
  let finishInitialRead: ((result: { data: { session: Session | null }; error: null }) => void) | undefined
  mocks.getSession.mockReturnValueOnce(new Promise(resolve => { finishInitialRead = resolve }))
  render(<AuthProvider><Probe /></AuthProvider>)
  act(() => { authStateCallback?.('SIGNED_OUT', null) })
  expect(await screen.findByText('unauthenticated:none')).toBeInTheDocument()
  await act(async () => { finishInitialRead?.({ data: { session: makeSession('admin') }, error: null }) })
  expect(screen.getByText('unauthenticated:none')).toBeInTheDocument()
  expect(screen.getByTestId('user-id')).toHaveTextContent('none')
  expect(mocks.getAccountStatus).not.toHaveBeenCalled()
})

it('blocks a restored suspended session without exposing authenticated routes or roles', async () => {
  mocks.getSession.mockResolvedValueOnce({ data: { session: makeSession('alice') }, error: null })
  mocks.getAccountStatus.mockResolvedValueOnce('SUSPENDED')
  render(<AuthProvider><Probe /></AuthProvider>)
  expect(await screen.findByText('unauthenticated:none')).toBeInTheDocument()
  expect(screen.getByTestId('user-id')).toHaveTextContent('none')
  expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
  expect(mocks.waitForRoleClaim).not.toHaveBeenCalled()
})

it('fails closed when protected account status cannot be read without treating credentials as wrong', async () => {
  mocks.getSession.mockResolvedValueOnce({ data: { session: makeSession('alice') }, error: null })
  mocks.getAccountStatus.mockRejectedValueOnce(new Error('Account status unavailable'))
  render(<AuthProvider><Probe /></AuthProvider>)
  expect(await screen.findByText('unauthenticated:none')).toBeInTheDocument()
  expect(mocks.waitForRoleClaim).not.toHaveBeenCalled()
})

describe(
  'AuthProvider',
  () => {
    it('starts loading and becomes unauthenticated when Supabase restores no session', async () => {
      let resolveGetSession:
        | ((
            value: {
              data: {
                session: null
              }
              error: null
            },
          ) => void)
        | undefined

      mocks.getSession.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveGetSession = resolve
        }),
      )

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )

      expect(
        screen.getByText(
          'loading:none',
        ),
      ).toBeInTheDocument()

      await act(async () => {
        resolveGetSession?.({
          data: {
            session: null,
          },
          error: null,
        })
      })

      expect(
        await screen.findByText(
          'unauthenticated:none',
        ),
      ).toBeInTheDocument()

      expect(
        mocks.ensureUserProfile,
      ).not.toHaveBeenCalled()
    })

    it('restores an authenticated Supabase session with its authoritative role', async () => {
      mocks.getSession.mockResolvedValueOnce({
        data: {
          session:
            makeSession('alice'),
        },
        error: null,
      })

      mocks.waitForRoleClaim.mockResolvedValueOnce(
        'CUSTOMER',
      )

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )

      expect(
        await screen.findByText(
          'authenticated:CUSTOMER',
        ),
      ).toBeInTheDocument()

      expect(
        screen.getByTestId(
          'user-id',
        ),
      ).toHaveTextContent(
        'alice',
      )
    })

    it('verifies the server-provisioned profile before resolving the application role', async () => {
      mocks.getSession.mockResolvedValueOnce({
        data: {
          session:
            makeSession('alice'),
        },
        error: null,
      })

      mocks.waitForRoleClaim.mockResolvedValueOnce(
        'SELLER',
      )

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )

      expect(
        await screen.findByText(
          'authenticated:SELLER',
        ),
      ).toBeInTheDocument()

      expect(
        mocks.ensureUserProfile,
      ).toHaveBeenCalledTimes(1)

      expect(
        mocks.ensureUserProfile,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'alice',
          uid: 'alice',
        }),
      )

      expect(
        mocks.waitForRoleClaim,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'alice',
          uid: 'alice',
        }),
      )

      expect(
        mocks.ensureUserProfile.mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        mocks.waitForRoleClaim.mock
          .invocationCallOrder[0],
      )
    })

    it('uses CUSTOMER as a safe UI fallback when no authoritative role is available', async () => {
      mocks.getSession.mockResolvedValueOnce({
        data: {
          session:
            makeSession('alice'),
        },
        error: null,
      })

      mocks.waitForRoleClaim.mockResolvedValueOnce(
        null,
      )

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )

      expect(
        await screen.findByText(
          'authenticated:CUSTOMER',
        ),
      ).toBeInTheDocument()
    })

    it('does not let caller-controlled profile options promote a user', async () => {
      mocks.getSession.mockResolvedValueOnce({
        data: {
          session:
            makeSession('alice'),
        },
        error: null,
      })

      mocks.waitForRoleClaim.mockResolvedValueOnce(
        'SELLER',
      )

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )

      expect(
        await screen.findByText(
          'authenticated:SELLER',
        ),
      ).toBeInTheDocument()

      expect(
        mocks.ensureUserProfile,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'alice',
          uid: 'alice',
        }),
      )

      expect(
        mocks.ensureUserProfile,
      ).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          role: 'SELLER',
        }),
      )
    })

    it('keeps authentication valid when profile verification temporarily fails', async () => {
      mocks.getSession.mockResolvedValueOnce({
        data: {
          session:
            makeSession('alice'),
        },
        error: null,
      })

      const profileError =
        new Error(
          'Supabase profile unavailable',
        )

      mocks.ensureUserProfile.mockRejectedValueOnce(
        profileError,
      )

      mocks.waitForRoleClaim.mockResolvedValueOnce(
        'CUSTOMER',
      )

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )

      expect(
        await screen.findByText(
          'authenticated:CUSTOMER',
        ),
      ).toBeInTheDocument()

      expect(
        console.error,
      ).toHaveBeenCalledWith(
        'Failed to verify Supabase user profile:',
      )
    })

    it('keeps the valid session authenticated with CUSTOMER fallback when role resolution fails', async () => {
      mocks.getSession.mockResolvedValueOnce({
        data: {
          session:
            makeSession('alice'),
        },
        error: null,
      })

      const roleError =
        new Error(
          'role RPC unavailable',
        )

      mocks.waitForRoleClaim.mockRejectedValueOnce(
        roleError,
      )

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )

      expect(
        await screen.findByText(
          'authenticated:CUSTOMER',
        ),
      ).toBeInTheDocument()

      expect(
        console.error,
      ).toHaveBeenCalledWith(
        'Failed to resolve Supabase application role:',
      )
    })

    it('degrades to unauthenticated when initial Supabase session restoration fails', async () => {
      const restoreError =
        new Error(
          'session restoration failed',
        )

      mocks.getSession.mockResolvedValueOnce({
        data: {
          session: null,
        },
        error: restoreError,
      })

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )

      expect(
        await screen.findByText(
          'unauthenticated:none',
        ),
      ).toBeInTheDocument()

      expect(
        console.error,
      ).toHaveBeenCalledWith(
        'Failed to restore Supabase session:',
      )
    })

    it('ignores a stale role lookup from a superseded Supabase auth-state event', async () => {
      mocks.getSession.mockResolvedValueOnce({
        data: {
          session: null,
        },
        error: null,
      })

      let resolveFirstRole:
        | ((
            value:
              | 'CUSTOMER'
              | null,
          ) => void)
        | undefined

      mocks.waitForRoleClaim
        .mockImplementationOnce(
          () =>
            new Promise(
              (resolve) => {
                resolveFirstRole =
                  resolve
              },
            ),
        )
        .mockResolvedValueOnce(
          'SELLER',
        )

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )

      expect(
        await screen.findByText(
          'unauthenticated:none',
        ),
      ).toBeInTheDocument()

      expect(
        authStateCallback,
      ).toBeTypeOf('function')

      act(() => {
        authStateCallback?.(
          'SIGNED_IN',
          makeSession('alice'),
        )

        authStateCallback?.(
          'SIGNED_IN',
          makeSession('bob'),
        )
      })

      expect(
        await screen.findByText(
          'authenticated:SELLER',
        ),
      ).toBeInTheDocument()

      expect(
        screen.getByTestId(
          'user-id',
        ),
      ).toHaveTextContent(
        'bob',
      )

      await act(async () => {
        resolveFirstRole?.(
          'CUSTOMER',
        )
      })

      expect(
        screen.getByText(
          'authenticated:SELLER',
        ),
      ).toBeInTheDocument()

      expect(
        screen.getByTestId(
          'user-id',
        ),
      ).toHaveTextContent(
        'bob',
      )
    })

    it('reacts to a Supabase SIGNED_OUT event', async () => {
      mocks.getSession.mockResolvedValueOnce({
        data: {
          session:
            makeSession('alice'),
        },
        error: null,
      })

      render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )

      expect(
        await screen.findByText(
          'authenticated:CUSTOMER',
        ),
      ).toBeInTheDocument()

      act(() => {
        authStateCallback?.(
          'SIGNED_OUT',
          null,
        )
      })

      expect(
        await screen.findByText(
          'unauthenticated:none',
        ),
      ).toBeInTheDocument()

      expect(
        screen.getByTestId(
          'user-id',
        ),
      ).toHaveTextContent(
        'none',
      )
    })

    it('unsubscribes from Supabase auth events when the provider unmounts', async () => {
      mocks.getSession.mockResolvedValueOnce({
        data: {
          session: null,
        },
        error: null,
      })

      const {
        unmount,
      } = render(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      )

      await screen.findByText(
        'unauthenticated:none',
      )

      unmount()

      expect(
        mocks.unsubscribe,
      ).toHaveBeenCalledTimes(1)
    })
  },
)
it('does not authenticate an unverified session or resolve a privileged role', async () => {
  const session = makeSession('pending')
  delete session.user.email_confirmed_at
  mocks.getSession.mockResolvedValueOnce({ data: { session }, error: null })
  render(<AuthProvider><Probe /></AuthProvider>)
  expect(await screen.findByText('unauthenticated:none')).toBeInTheDocument()
  expect(mocks.ensureUserProfile).not.toHaveBeenCalled()
  expect(mocks.waitForRoleClaim).not.toHaveBeenCalled()
})
