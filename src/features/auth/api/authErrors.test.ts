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
