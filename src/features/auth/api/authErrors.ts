const registrationRetryMessage = 'Registration could not be completed. If you already have an account, sign in or use password recovery.'

export function toAuthErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
          ? error.message
          : ''

  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : ''
  const messages: Record<string, string> = {
    registration_session_mismatch: 'Verification no longer matches this registration. Please sign in or verify your email again.',
    registration_profile_missing: 'Your account is verified, but its profile is unavailable. Please sign in and try again.',
    email_confirmation_disabled: 'Email confirmation must be enabled before registration can continue. Please contact support.',
    invalid_credentials: 'Invalid email or password.',
    user_banned: 'This account is suspended. Please contact support.',
    account_status_unavailable: 'Your account status could not be verified. Please try again.',
    otp_invalid: 'The verification code is incorrect.',
    email_not_confirmed: 'Please verify your email before signing in.',
    user_already_exists: registrationRetryMessage,
    email_exists: registrationRetryMessage,
    weak_password: 'Your password does not meet the required security requirements.',
    email_address_invalid: 'Enter a valid email address.',
    email_address_not_authorized: 'Email delivery is restricted by the current authentication configuration. Please contact support.',
    over_email_send_rate_limit: 'Too many requests. Please wait and try again.',
    over_request_rate_limit: 'Too many requests. Please wait and try again.',
    otp_expired: 'This verification code has expired. Request a new code.',
    signup_disabled: 'New account registration is currently disabled.',
    unexpected_failure: 'Account registration or verification is temporarily unavailable. Please try again later.',
  }
  if (code === 'unexpected_failure' && /sending.*(email|mail)|smtp/i.test(message)) {
    return 'The verification email could not be sent. Please try again later or contact support.'
  }
  if (Object.hasOwn(messages, code)) return messages[code]
  const normalized = message.toLowerCase()

  if (
    normalized.includes('invalid login credentials') ||
    normalized.includes('invalid_credentials')
  ) {
    return 'Invalid email or password.'
  }

  if (
    normalized.includes('user already registered') ||
    normalized.includes('already been registered')
  ) {
    return registrationRetryMessage
  }

  if (
    normalized.includes('email not confirmed') ||
    normalized.includes('email_not_confirmed')
  ) {
    return 'Please verify your email before signing in.'
  }

  if (
    normalized.includes('token has expired') ||
    normalized.includes('otp expired') ||
    normalized.includes('expired')
  ) {
    return 'This verification code has expired. Request a new code.'
  }

  if (
    normalized.includes('invalid token') ||
    normalized.includes('token is invalid') ||
    normalized.includes('otp invalid') ||
    normalized.includes('incorrect')
  ) {
    return 'The verification code is incorrect.'
  }

  if (
    normalized.includes('password should be') ||
    normalized.includes('weak password')
  ) {
    return 'Your password does not meet the required security requirements.'
  }

  if (
    normalized.includes('rate limit') ||
    normalized.includes('too many requests') ||
    normalized.includes('once every') ||
    normalized.includes('security purposes')
  ) {
    return 'Too many requests. Please wait and try again.'
  }

  if (
    normalized.includes('signup is disabled') ||
    normalized.includes('signups not allowed')
  ) {
    return 'New account registration is currently disabled.'
  }

  if (normalized.includes('network') || normalized.includes('fetch')) {
    return 'Network error. Check your internet connection and try again.'
  }

  return 'Authentication failed. Please try again.'
}
