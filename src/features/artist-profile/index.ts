export { subscribeArtistProfile, toArtistProfileError, updateArtistProfile } from './api/artistProfileRepository'
export { ArtistProfileEditForm } from './components/ArtistProfileEditForm'
export { PublicArtistArtworks } from './components/PublicArtistArtworks'
export { PublicArtistHeader } from './components/PublicArtistHeader'
export { useArtistProfile } from './hooks/useArtistProfile'
export { useUpdateArtistProfile, type SaveStatus } from './hooks/useUpdateArtistProfile'
export {
  ARTIST_BIO_MAX_LENGTH,
  ARTIST_BIO_MIN_LENGTH,
  ARTIST_DISPLAY_NAME_MAX_LENGTH,
  ARTIST_DISPLAY_NAME_MIN_LENGTH,
  artistProfileEditSchema,
  type ArtistProfileEditFormValues,
} from './schemas'
export {
  isArtistProfileError,
  type ArtistProfile,
  type ArtistProfileError,
  type ArtistProfileErrorCode,
  type ArtistProfileState,
  type UpdateArtistProfileInput,
} from './types'
