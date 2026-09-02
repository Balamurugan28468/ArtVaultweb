import { FirebaseError } from 'firebase/app'
import { env } from '@/config/env'

const MESSAGES_BY_CODE: Record<string, string> = {
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/weak-password': 'Password does not meet the security requirements.',
  // Security: never reveal *which* part was wrong (a non-existent email vs.
  // the right email with the wrong password) — all three collapse to the
  // same message so a sign-in failure can't be used to enumerate accounts.
  // Modern Firebase Auth SDKs already return only auth/invalid-credential
  // for both cases; the other two are mapped defensively in case an older
  // SDK/emulator version ever returns them directly.
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/user-not-found': 'Invalid email or password.',
  'auth/wrong-password': 'Invalid email or password.',
  'auth/user-disabled': 'This account is currently unavailable.',
  'auth/operation-not-allowed': 'Sign-in is temporarily unavailable.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': 'Network error — check your connection and try again.',
}

// A real user-facing internet-connectivity problem and "the local Firebase
// emulator isn't running/reachable" surface as the exact same Firebase SDK
// error code (auth/network-request-failed) — the SDK has no way to tell
// them apart itself. Presenting the generic message in local dev actively
// misleads: it sends a developer/reviewer to check their internet
// connection when the real, actionable fix is starting the emulators (see
// docs/DEPLOYMENT.md). Only override when the app is actually configured to
// talk to the emulators, so a real production network failure still gets
// the honest generic message.
const EMULATOR_NETWORK_ERROR_MESSAGE =
  'Cannot reach the Firebase emulator (expected at 127.0.0.1:9099 for Auth). ' +
  'Start the Local Emulator Suite — see docs/DEPLOYMENT.md — then try again.'

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.'

export function toAuthErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    // Safe to log unconditionally: FirebaseError's own code/message never
    // echo back credentials, tokens, or other request input — only a
    // machine-readable failure reason (e.g. "auth/network-request-failed").
    console.error('Firebase Auth error:', error.code, error.message)

    if (error.code === 'auth/network-request-failed' && env.VITE_USE_FIREBASE_EMULATORS) {
      return EMULATOR_NETWORK_ERROR_MESSAGE
    }
    return MESSAGES_BY_CODE[error.code] ?? FALLBACK_MESSAGE
  }
  return FALLBACK_MESSAGE
}
