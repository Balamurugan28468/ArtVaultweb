export function toAuthErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''

  const normalized = message.toLowerCase()

  if (
    normalized.includes('invalid login credentials') ||
    normalized.includes('invalid_credentials')
  ) {
    return 'Incorrect email or password.'
  }

  if (
    normalized.includes('user already registered') ||
    normalized.includes('already been registered')
  ) {
    return 'An account already exists with this email.'
  }

  if (normalized.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.'
  }

  if (
    normalized.includes('password should be') ||
    normalized.includes('weak password')
  ) {
    return 'Your password does not meet the required security requirements.'
  }

  if (
    normalized.includes('rate limit') ||
    normalized.includes('too many requests')
  ) {
    return 'Too many requests. Please wait a moment and try again.'
  }

  if (
    normalized.includes('signup is disabled') ||
    normalized.includes('signups not allowed')
  ) {
    return 'New account registration is currently disabled.'
  }

  if (normalized.includes('network')) {
    return 'Network error. Check your internet connection and try again.'
  }

  if (message.trim()) {
    console.error('Supabase authentication error:', message)
  }

  return 'Authentication failed. Please try again.'
}