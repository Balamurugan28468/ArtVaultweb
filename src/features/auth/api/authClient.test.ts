import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const mocks = vi.hoisted(() => {
  const getAccountStatus = vi.fn()
  const signUp = vi.fn()
  const signInWithPassword = vi.fn()
  const signOut = vi.fn()
  const resetPasswordForEmail = vi.fn()
  const verifyOtp = vi.fn()
  const resend = vi.fn()
  const getUser = vi.fn()
  const updateUser = vi.fn()
  const update = vi.fn().mockReturnThis()
  const from = vi.fn().mockReturnValue({
    update,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'alice' }, error: null }),
  })

  const supabase = {
    auth: {
      signUp,
      getUser,
      updateUser,
      signInWithPassword,
      signOut,
      resetPasswordForEmail,
      verifyOtp,
      resend,
    },
    from,
  }

  return {
    getAccountStatus,
    signUp,
    getUser,
    updateUser,
    update,
    from,
    signInWithPassword,
    signOut,
    resetPasswordForEmail,
    verifyOtp,
    resend,
    supabase,
  }
})

vi.mock(
  '@/lib/supabase/client',
  () => ({
    createClient: () =>
      mocks.supabase,
    createRegistrationClient: () => mocks.supabase,
  }),
)

vi.mock('./accountAccess', () => ({ getAccountStatus: mocks.getAccountStatus }))

const {
  completeSignUp,
  requestPasswordReset,
  signInWithEmail,
  signOutUser,
  signUpWithEmail,
  verifyEmailOtp,
  resendVerificationOtp,
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
  mocks.getAccountStatus.mockReset().mockResolvedValue('ACTIVE')
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: fakeUser }, error: null })
  mocks.updateUser.mockReset().mockResolvedValue({ data: { user: fakeUser }, error: null })
  mocks.update.mockClear()
  mocks.from.mockClear()
  mocks.signUp.mockReset()
  mocks.signInWithPassword.mockReset()
  mocks.signOut.mockReset()
  mocks.resetPasswordForEmail.mockReset()
  mocks.verifyOtp.mockReset()
  mocks.resend.mockReset()

  mocks.signUp.mockResolvedValue({
    data: {
      user: { ...fakeUser, email_confirmed_at: null },
      session: null,
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

  mocks.verifyOtp.mockResolvedValue({
    data: {
      user: fakeUser,
      session: { access_token: 'session-token' },
    },
    error: null,
  })

  mocks.resend.mockResolvedValue({
    data: {},
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
          emailVerified: false,
          createdAt:
            '2026-09-19T10:00:00.000Z',
        },
        needsEmailConfirmation:
          true,
      })
    })

    it('reports that email confirmation is needed when Supabase creates the user without a session', async () => {
      mocks.signUp.mockResolvedValueOnce({
        data: {
          user: { ...fakeUser, email_confirmed_at: null },
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
        'Registration could not be completed.',
      )
    })
  },
)

describe(
  'signInWithEmail',
  () => {
    it.each(['alice@gmal.com', 'alice@gmail.com'])('passes %s and the unchanged password exclusively to Supabase Auth', async (email) => {
      await signInWithEmail({ email: `  ${email}  `, password: ' Testpass1 ' })
      expect(mocks.signInWithPassword).toHaveBeenCalledExactlyOnceWith({ email, password: ' Testpass1 ' })
      expect(mocks.from).not.toHaveBeenCalled()
      expect(mocks.update).not.toHaveBeenCalled()
    })

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
        'Invalid email or password.',
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
        'Too many requests. Please wait and try again.',
      )
    })
  },
)

describe('verifyEmailOtp', () => {
  it('verifies the OTP with type signup, signs out session, and returns the verified user', async () => {
    const result = await verifyEmailOtp({
      email: '  a@example.com  ',
      token: ' 123456 ',
    })

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      email: 'a@example.com',
      token: '123456',
      type: 'signup',
    })

    expect(mocks.signOut).toHaveBeenCalled()
    expect(result.user.email).toBe('a@example.com')
  })

  it('maps expired OTP error properly', async () => {
    mocks.verifyOtp.mockResolvedValueOnce({
      data: { user: null },
      error: new Error('Token has expired or is invalid'),
    })

    await expect(
      verifyEmailOtp({
        email: 'a@example.com',
        token: '123456',
      }),
    ).rejects.toThrow('This verification code has expired. Request a new code.')
  })
})

describe('resendVerificationOtp', () => {
  it('resends signup OTP with trimmed email', async () => {
    await expect(
      resendVerificationOtp('  a@example.com  '),
    ).resolves.toBeUndefined()

    expect(mocks.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'a@example.com',
    })
  })

  it('maps rate limit error on resend', async () => {
    mocks.resend.mockResolvedValueOnce({
      error: new Error('For security purposes, you can only request this once every 60 seconds'),
    })

    await expect(
      resendVerificationOtp('a@example.com'),
    ).rejects.toThrow('Too many requests. Please wait and try again.')
  })
})
it('does not report OTP success if sign-out fails', async () => {
  mocks.signOut.mockResolvedValueOnce({ error: new Error('Network request failed') })
  await expect(verifyEmailOtp({ email: 'a@example.com', token: '123456' })).rejects.toThrow('Network error')
})
it('does not continue OTP registration when hosted email confirmation is disabled', async () => {
  mocks.signUp.mockResolvedValueOnce({ data: { user: fakeUser, session: { access_token: 'test-only' } }, error: null })
  await expect(signUpWithEmail({ email: 'a@example.com', password: 'Testpass1', displayName: 'Alice' })).rejects.toThrow('Email confirmation must be enabled')
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
})
it('handles an obfuscated duplicate registration without pretending a new OTP was sent', async () => {
  mocks.signUp.mockResolvedValueOnce({ data: { user: { ...fakeUser, identities: [] }, session: null }, error: null })
  await expect(signUpWithEmail({ email: 'a@example.com', password: 'Testpass1', displayName: 'Alice' })).rejects.toThrow('Registration could not be completed.')
})
it('rejects Supabase unconfirmed-email sign-in errors', async () => {
  mocks.signInWithPassword.mockResolvedValueOnce({ data: { user: null }, error: { code: 'email_not_confirmed', message: 'Email not confirmed' } })
  await expect(signInWithEmail({ email: 'a@example.com', password: 'Testpass1' })).rejects.toThrow('Please verify your email')
})

it('signs out even if the trigger-provisioned profile cannot be read', async () => {
  mocks.supabase.from.mockReturnValueOnce({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'Profile unavailable' } }) })
  await expect(verifyEmailOtp({ email: 'a@example.com', token: '123456' })).rejects.toThrow()
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
})
it('does not report unverified OTP user as verified and still clears its session', async () => {
  mocks.verifyOtp.mockResolvedValueOnce({ data: { user: { ...fakeUser, email_confirmed_at: null } }, error: null })
  await expect(verifyEmailOtp({ email: 'a@example.com', token: '123456' })).rejects.toThrow('Please verify your email')
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
})

const registration = { userId: 'alice', email: 'a@example.com', displayName: 'Alice', password: 'Testpass1', confirmPassword: 'Testpass1' }
it('checks account status by the verified Auth identity before accepting login', async () => {
  await signInWithEmail({ email: 'a@example.com', password: 'Testpass1' })
  expect(mocks.getAccountStatus).toHaveBeenCalledExactlyOnceWith('alice')
})
it('rejects a suspended authenticated account and clears its local session', async () => {
  mocks.getAccountStatus.mockResolvedValueOnce('SUSPENDED')
  await expect(signInWithEmail({ email: 'a@example.com', password: 'Testpass1' })).rejects.toThrow('This account is suspended.')
  expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
})
it('does not confuse an unavailable account profile with invalid credentials', async () => {
  mocks.getAccountStatus.mockRejectedValueOnce(new Error('internal database error'))
  await expect(signInWithEmail({ email: 'a@example.com', password: 'Testpass1' })).rejects.toThrow('Your account status could not be verified.')
  expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
})
it.each(['12345', '12345678', '12a456'])('never submits a partial or malformed OTP to Supabase', async (token) => {
  await expect(verifyEmailOtp({ email: 'a@example.com', token })).rejects.toThrow('The verification code is incorrect.')
  expect(mocks.verifyOtp).not.toHaveBeenCalled()
})
it('retains the verified session for final account completion only when explicitly requested', async () => {
  const result = await verifyEmailOtp({ email: 'a@example.com', token: '123456' }, { retainSession: true })
  expect(result.user.id).toBe('alice')
  expect(mocks.signOut).not.toHaveBeenCalled()
})
it('final completion checks Auth, updates one existing profile and signs out', async () => {
  await completeSignUp(registration)
  expect(mocks.getUser).toHaveBeenCalledTimes(1)
  expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'Testpass1', data: { display_name: 'Alice' } })
  expect(mocks.from).toHaveBeenCalledWith('profiles')
  expect(mocks.update).toHaveBeenCalledTimes(1)
  expect(mocks.update).toHaveBeenCalledWith({ display_name: 'Alice' })
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
  expect(mocks.supabase.from).not.toHaveBeenCalledWith('user_roles')
})
it.each([
  { ...fakeUser, id: 'another-identity' },
  { ...fakeUser, email: 'other@example.com' },
  { ...fakeUser, email_confirmed_at: null },
  null,
])('final completion rejects a mismatched or unverified Auth identity', async (user) => {
  mocks.getUser.mockResolvedValueOnce({ data: { user }, error: null })
  await expect(completeSignUp(registration)).rejects.toThrow('Verification no longer matches')
  expect(mocks.updateUser).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
})
it('same-password response does not create a duplicate account/profile or block completion', async () => {
  mocks.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { code: 'same_password' } })
  await completeSignUp(registration)
  expect(mocks.signUp).not.toHaveBeenCalled()
  expect(mocks.update).toHaveBeenCalledTimes(1)
})
it('does not report completion when an Auth password update fails', async () => {
  mocks.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { code: 'weak_password' } })
  await expect(completeSignUp(registration)).rejects.toThrow('security requirements')
  expect(mocks.update).not.toHaveBeenCalled()
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
})
it('a rejected profile write still signs out and cannot pretend registration completed', async () => {
  mocks.update.mockImplementationOnce(() => { throw new Error('Profile write unavailable') })
  await expect(completeSignUp(registration)).rejects.toThrow()
  expect(mocks.signOut).toHaveBeenCalledTimes(1)
})
