export { getUserProfile, subscribeUserProfile, toAccountError, updateUserProfile } from './api/profileRepository'
export { AccountHeader } from './components/AccountHeader'
export { AccountSections } from './components/AccountSections'
export { EditProfileModal } from './components/EditProfileModal'
export { useUpdateProfile, type SaveStatus } from './hooks/useUpdateProfile'
export { useUserProfile } from './hooks/useUserProfile'
export {
  BIO_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  PHONE_MAX_LENGTH,
  updateProfileSchema,
  type UpdateProfileFormValues,
} from './schemas'
export {
  isAccountError,
  type AccountError,
  type AccountErrorCode,
  type ProfileState,
  type UpdateUserProfileInput,
} from './types'
