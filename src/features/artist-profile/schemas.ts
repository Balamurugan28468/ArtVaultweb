import { z } from 'zod'
import { requiredTextField } from '@/shared/validation/fields'

// Mirrors sellers/{uid}'s businessName/description bounds (see
// firestore.rules' isValidArtistDisplayName/isValidArtistBio) — the public
// display name and bio start as a copy of those private fields but are
// edited independently afterward, so the same bounds keep them consistent
// without coupling the two documents together.
export const ARTIST_DISPLAY_NAME_MIN_LENGTH = 2
export const ARTIST_DISPLAY_NAME_MAX_LENGTH = 80
export const ARTIST_BIO_MIN_LENGTH = 10
export const ARTIST_BIO_MAX_LENGTH = 500

export const artistProfileEditSchema = z.object({
  displayName: requiredTextField({
    label: 'Display name',
    min: ARTIST_DISPLAY_NAME_MIN_LENGTH,
    max: ARTIST_DISPLAY_NAME_MAX_LENGTH,
  }),
  bio: requiredTextField({ label: 'Bio', min: ARTIST_BIO_MIN_LENGTH, max: ARTIST_BIO_MAX_LENGTH }),
})

export type ArtistProfileEditFormValues = z.infer<typeof artistProfileEditSchema>
