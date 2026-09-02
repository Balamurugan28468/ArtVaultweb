import { FirebaseError } from 'firebase/app'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toAuthErrorMessage } from './authErrors'

describe('toAuthErrorMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('maps a known Firebase Auth error code to a friendly message', () => {
    const error = new FirebaseError('auth/email-already-in-use', 'boom')
    expect(toAuthErrorMessage(error)).toBe('An account with this email already exists.')
  })

  it('falls back to a generic message for an unmapped Firebase error code', () => {
    const error = new FirebaseError('auth/some-new-code', 'boom')
    expect(toAuthErrorMessage(error)).toBe('Something went wrong. Please try again.')
  })

  it('falls back to a generic message for a non-Firebase error', () => {
    expect(toAuthErrorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.')
  })

  it('maps weak-password to an actionable, policy-referencing message', () => {
    const error = new FirebaseError('auth/weak-password', 'boom')
    expect(toAuthErrorMessage(error)).toBe('Password does not meet the security requirements.')
  })

  it('maps too-many-requests', () => {
    const error = new FirebaseError('auth/too-many-requests', 'boom')
    expect(toAuthErrorMessage(error)).toBe('Too many attempts. Please try again later.')
  })

  it('maps user-disabled', () => {
    const error = new FirebaseError('auth/user-disabled', 'boom')
    expect(toAuthErrorMessage(error)).toBe('This account is currently unavailable.')
  })

  it('maps operation-not-allowed', () => {
    const error = new FirebaseError('auth/operation-not-allowed', 'boom')
    expect(toAuthErrorMessage(error)).toBe('Sign-in is temporarily unavailable.')
  })

  it('maps invalid-email to the same wording used for client-side validation', () => {
    const error = new FirebaseError('auth/invalid-email', 'boom')
    expect(toAuthErrorMessage(error)).toBe('Enter a valid email address.')
  })

  describe('account enumeration protection', () => {
    it.each(['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'])(
      'maps %s to the same generic "Invalid email or password." message',
      (code) => {
        const error = new FirebaseError(code, 'boom')
        expect(toAuthErrorMessage(error)).toBe('Invalid email or password.')
      },
    )
  })

  it('logs the Firebase error code and message (never credentials) for a known FirebaseError', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new FirebaseError('auth/email-already-in-use', 'boom')

    toAuthErrorMessage(error)

    expect(errorSpy).toHaveBeenCalledWith('Firebase Auth error:', 'auth/email-already-in-use', 'boom')
  })

  it('reports network-request-failed as an emulator-unreachable problem when configured for emulators (the test default)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new FirebaseError('auth/network-request-failed', 'boom')

    expect(toAuthErrorMessage(error)).toMatch(/emulator/i)
    expect(toAuthErrorMessage(error)).not.toMatch(/check your connection/i)
  })

  it('reports network-request-failed as a plain connectivity problem when not configured for emulators', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.doMock('@/config/env', () => ({ env: { VITE_USE_FIREBASE_EMULATORS: false } }))
    vi.resetModules()

    const { toAuthErrorMessage: toAuthErrorMessageWithoutEmulators } = await import('./authErrors')
    const error = new FirebaseError('auth/network-request-failed', 'boom')

    expect(toAuthErrorMessageWithoutEmulators(error)).toBe('Network error — check your connection and try again.')

    vi.doUnmock('@/config/env')
    vi.resetModules()
  })
})
