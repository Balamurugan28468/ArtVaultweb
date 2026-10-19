import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { toAuthErrorMessage } from './authErrors'

describe('toAuthErrorMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('invalid credentials', () => {
    it('returns a generic credential error without revealing whether the account exists', () => {
      const error = new Error('Invalid login credentials')

      expect(
        toAuthErrorMessage(error),
      ).toBe(
        'Incorrect email or password.',
      )
    })

    it('recognizes the underscore-form invalid_credentials message', () => {
      const error = new Error('invalid_credentials')

      expect(
        toAuthErrorMessage(error),
      ).toBe(
        'Incorrect email or password.',
      )
    })
  })

  describe('registration errors', () => {
    it('maps an already-registered account to a friendly message', () => {
      const error = new Error('User already registered')

      expect(
        toAuthErrorMessage(error),
      ).toBe(
        'An account already exists with this email.',
      )
    })

    it('recognizes the alternate already-registered wording', () => {
      const error = new Error(
        'A user with this email has already been registered',
      )

      expect(
        toAuthErrorMessage(error),
      ).toBe(
        'An account already exists with this email.',
      )
    })

    it('maps disabled signups', () => {
      const error = new Error(
        'Signup is disabled',
      )

      expect(
        toAuthErrorMessage(error),
      ).toBe(
        'New account registration is currently disabled.',
      )
    })

    it('recognizes alternate disabled-signup wording', () => {
      const error = new Error(
        'Signups not allowed for this instance',
      )

      expect(
        toAuthErrorMessage(error),
      ).toBe(
        'New account registration is currently disabled.',
      )
    })
  })

  describe('email confirmation', () => {
    it('maps an unconfirmed email to an actionable message', () => {
      const error = new Error(
        'Email not confirmed',
      )

      expect(
        toAuthErrorMessage(error),
      ).toBe(
        'Please confirm your email before signing in.',
      )
    })
  })

  describe('password policy', () => {
    it('maps Supabase password-policy errors', () => {
      const error = new Error(
        'Password should be at least 8 characters',
      )

      expect(
        toAuthErrorMessage(error),
      ).toBe(
        'Your password does not meet the required security requirements.',
      )
    })

    it('recognizes weak-password wording defensively', () => {
      const error = new Error(
        'Weak password',
      )

      expect(
        toAuthErrorMessage(error),
      ).toBe(
        'Your password does not meet the required security requirements.',
      )
    })
  })

  describe('rate limiting', () => {
    it('maps rate-limit errors', () => {
      const error = new Error(
        'Email rate limit exceeded',
      )

      expect(
        toAuthErrorMessage(error),
      ).toBe(
        'Too many requests. Please wait a moment and try again.',
      )
    })

    it('recognizes too-many-requests wording', () => {
      const error = new Error(
        'Too many requests',
      )

      expect(
        toAuthErrorMessage(error),
      ).toBe(
        'Too many requests. Please wait a moment and try again.',
      )
    })
  })

  describe('network errors', () => {
    it('maps network failures to a useful connectivity message', () => {
      const error = new Error(
        'Network request failed',
      )

      expect(
        toAuthErrorMessage(error),
      ).toBe(
        'Network error. Check your internet connection and try again.',
      )
    })
  })

  describe('string errors', () => {
    it('supports a string error returned by a compatibility layer', () => {
      expect(
        toAuthErrorMessage(
          'Invalid login credentials',
        ),
      ).toBe(
        'Incorrect email or password.',
      )
    })
  })

  describe('unknown errors', () => {
    it('returns the generic Supabase authentication message for an unknown Error', () => {
      const errorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      expect(
        toAuthErrorMessage(
          new Error('boom'),
        ),
      ).toBe(
        'Authentication failed. Please try again.',
      )

      expect(
        errorSpy,
      ).toHaveBeenCalledWith(
        'Supabase authentication error:',
        'boom',
      )
    })

    it('does not expose an unknown raw error to the user', () => {
      const errorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      expect(
        toAuthErrorMessage({
          unexpected: true,
        }),
      ).toBe(
        'Authentication failed. Please try again.',
      )

      expect(
        errorSpy,
      ).not.toHaveBeenCalled()
    })

    it('returns the generic message for an empty string', () => {
      const errorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      expect(
        toAuthErrorMessage(''),
      ).toBe(
        'Authentication failed. Please try again.',
      )

      expect(
        errorSpy,
      ).not.toHaveBeenCalled()
    })
  })
})