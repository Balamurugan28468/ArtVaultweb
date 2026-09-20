export {
  signInWithEmail,
  signOutUser,
  signUpWithEmail,
  requestPasswordReset,
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