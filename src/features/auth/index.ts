export {
  signInWithEmail,
  signOutUser,
  signUpWithEmail,
  requestPasswordReset,
  verifyEmailOtp,
  resendVerificationOtp,
  type VerifyEmailOtpInput,
  type VerifyEmailOtpResult,
} from './api/authClient'

export {
  toAuthErrorMessage,
} from './api/authErrors'

export {
  getCurrentRoleClaim,
  waitForRoleClaim,
} from './api/roleClaim'

export {
  mapSupabaseUser,
} from './api/userMapper'

export {
  SignInForm,
} from './components/SignInForm'

export {
  SignOutButton,
} from './components/SignOutButton'

export {
  SignUpForm,
} from './components/SignUpForm'

export {
  VerifyOtpForm,
} from './components/VerifyOtpForm'

export {
  signInSchema,
  signUpSchema,
  type SignInInput,
  type SignUpInput,
} from './schemas'

export {
  isUserRole,
  USER_ROLES,
  type AuthUser,
  type UserProfile,
  type UserRole,
} from './types'