import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const mocks = vi.hoisted(() => {
  const signUp = vi.fn()
  const signInWithPassword = vi.fn()
  const signOut = vi.fn()
  const resetPasswordForEmail = vi.fn()

  const supabase = {
    auth: {
      signUp,
      signInWithPassword,
      signOut,
      resetPasswordForEmail,
    },
  }

  return {
    signUp,
    signInWithPassword,
    signOut,
    resetPasswordForEmail,
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

const {
  requestPasswordReset,
  signInWithEmail,
  signOutUser,
  signUpWithEmail,
} = await import('./authClient')

const fakeUser = {
  id: 'alice',
  email: 'a@example.com',
  email_confirmed_at:
    '2026-09-19T10:00:00.000Z',
  created_at:
    '2026-09-19T10:00:00.000Z',
  phone: null,
  user_metadata: {
    display_name: 'Alice',
  },
}

beforeEach(() => {
  mocks.signUp.mockReset()
  mocks.signInWithPassword.mockReset()
  mocks.signOut.mockReset()
  mocks.resetPasswordForEmail.mockReset()

  mocks.signUp.mockResolvedValue({
    data: {
      user: fakeUser,
      session: {
        access_token: 'test-token',
      },
    },
    error: null,
  })

  mocks.signInWithPassword.mockResolvedValue({
    data: {
      user: fakeUser,
    },
    error: null,
  })

  mocks.signOut.mockResolvedValue({
    error: null,
  })

  mocks.resetPasswordForEmail.mockResolvedValue({
    error: null,
  })
})

describe(
  'signUpWithEmail',
  () => {
    it('registers through Supabase Auth with trimmed email and display-name metadata', async () => {
      const result =
        await signUpWithEmail({
          email:
            '  a@example.com  ',
          password:
            'Testpass1',
          displayName:
            '  Alice  ',
        })

      expect(
        mocks.signUp,
      ).toHaveBeenCalledTimes(1)

      expect(
        mocks.signUp,
      ).toHaveBeenCalledWith({
        email: 'a@example.com',
        password: 'Testpass1',
        options: {
          data: {
            display_name: 'Alice',
          },
        },
      })

      expect(
        result,
      ).toEqual({
        user: {
          id: 'alice',
          uid: 'alice',
          email:
            'a@example.com',
          displayName: 'Alice',
          photoURL: null,
          phoneNumber: null,
          emailVerified: true,
          createdAt:
            '2026-09-19T10:00:00.000Z',
        },
        needsEmailConfirmation:
          false,
      })
    })

    it('reports that email confirmation is needed when Supabase creates the user without a session', async () => {
      mocks.signUp.mockResolvedValueOnce({
        data: {
          user: fakeUser,
          session: null,
        },
        error: null,
      })

      const result =
        await signUpWithEmail({
          email:
            'a@example.com',
          password:
            'Testpass1',
          displayName:
            'Alice',
        })

      expect(
        result.needsEmailConfirmation,
      ).toBe(true)
    })

    it('maps an already-registered Supabase error to a safe user-facing message', async () => {
      mocks.signUp.mockResolvedValueOnce({
        data: {
          user: null,
          session: null,
        },
        error:
          new Error(
            'User already registered',
          ),
      })

      await expect(
        signUpWithEmail({
          email:
            'a@example.com',
          password:
            'Testpass1',
          displayName:
            'Alice',
        }),
      ).rejects.toThrow(
        'An account already exists with this email.',
      )
    })
  },
)

describe(
  'signInWithEmail',
  () => {
    it('signs in through Supabase with a trimmed email and returns the mapped AuthUser', async () => {
      const result =
        await signInWithEmail({
          email:
            '  a@example.com  ',
          password:
            'Testpass1',
        })

      expect(
        mocks.signInWithPassword,
      ).toHaveBeenCalledTimes(1)

      expect(
        mocks.signInWithPassword,
      ).toHaveBeenCalledWith({
        email: 'a@example.com',
        password: 'Testpass1',
      })

      expect(
        result,
      ).toEqual({
        id: 'alice',
        uid: 'alice',
        email:
          'a@example.com',
        displayName: 'Alice',
        photoURL: null,
        phoneNumber: null,
        emailVerified: true,
        createdAt:
          '2026-09-19T10:00:00.000Z',
      })
    })

    it('maps invalid Supabase credentials to the account-enumeration-safe message', async () => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: {
          user: null,
        },
        error:
          new Error(
            'Invalid login credentials',
          ),
      })

      await expect(
        signInWithEmail({
          email:
            'a@example.com',
          password:
            'wrong-password',
        }),
      ).rejects.toThrow(
        'Incorrect email or password.',
      )
    })
  },
)

describe(
  'signOutUser',
  () => {
    it('signs out through Supabase Auth', async () => {
      await expect(
        signOutUser(),
      ).resolves.toBeUndefined()

      expect(
        mocks.signOut,
      ).toHaveBeenCalledTimes(1)
    })

    it('maps a Supabase network failure instead of silently succeeding', async () => {
      mocks.signOut.mockResolvedValueOnce({
        error:
          new Error(
            'Network request failed',
          ),
      })

      await expect(
        signOutUser(),
      ).rejects.toThrow(
        'Network error. Check your internet connection and try again.',
      )
    })
  },
)

describe(
  'requestPasswordReset',
  () => {
    it('sends the recovery email through Supabase with the correct callback URL', async () => {
      await expect(
        requestPasswordReset(
          '  a@example.com  ',
        ),
      ).resolves.toBeUndefined()

      expect(
        mocks.resetPasswordForEmail,
      ).toHaveBeenCalledTimes(1)

      expect(
        mocks.resetPasswordForEmail,
      ).toHaveBeenCalledWith(
        'a@example.com',
        {
          redirectTo:
            `${window.location.origin}/auth/callback?next=/auth/recovery`,
        },
      )
    })

    it('maps a Supabase rate-limit error to a useful message', async () => {
      mocks.resetPasswordForEmail.mockResolvedValueOnce({
        error:
          new Error(
            'Email rate limit exceeded',
          ),
      })

      await expect(
        requestPasswordReset(
          'a@example.com',
        ),
      ).rejects.toThrow(
        'Too many requests. Please wait a moment and try again.',
      )
    })
  },
)