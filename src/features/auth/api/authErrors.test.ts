import { FirebaseError } from 'firebase/app'
import { describe, expect, it } from 'vitest'
import { toAuthErrorMessage } from './authErrors'

describe('toAuthErrorMessage', () => {
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
})
