import { FirebaseError } from 'firebase/app'

const MESSAGES_BY_CODE: Record<string, string> = {
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/weak-password': 'Use at least 8 characters for your password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Network error — check your connection and try again.',
}

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.'

export function toAuthErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    return MESSAGES_BY_CODE[error.code] ?? FALLBACK_MESSAGE
  }
  return FALLBACK_MESSAGE
}
