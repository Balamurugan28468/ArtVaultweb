import { z } from 'zod'
import { requiredTextField } from '@/shared/validation/fields'

export const DISPLAY_NAME_MIN_LENGTH = 2
export const DISPLAY_NAME_MAX_LENGTH = 60
export const BIO_MAX_LENGTH = 280
export const PHONE_MAX_LENGTH = 20

// Deliberately loose: digits, spaces, +, -, and parentheses, 6-20 characters.
// Not tied to one country's format — validated for shape, not dialability.
const PHONE_PATTERN = /^[0-9+()\-\s]{6,20}$/

export const updateProfileSchema = z.object({
  displayName: requiredTextField({
    label: 'Display name',
    min: DISPLAY_NAME_MIN_LENGTH,
    max: DISPLAY_NAME_MAX_LENGTH,
  }),
  // Optional: empty (including whitespace-only, once trimmed) is valid and
  // left as-is; the regex/length checks only apply once the user has
  // actually typed something. A plain `.regex(...).optional().or(literal(''))`
  // chain looks equivalent but isn't — Zod evaluates each union branch
  // against the *original*, untrimmed input, so a whitespace-only value
  // would fail the trimmed-regex branch *and* fail the exact `''` literal
  // branch, incorrectly rejecting it as an invalid phone number.
  phoneNumber: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (value.length === 0) return
      if (value.length > PHONE_MAX_LENGTH) {
        ctx.addIssue({ code: 'custom', message: `Phone number must not exceed ${PHONE_MAX_LENGTH} characters.` })
        return
      }
      if (!PHONE_PATTERN.test(value)) {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number.' })
      }
    })
    .optional(),
  bio: z
    .string()
    .trim()
    .max(BIO_MAX_LENGTH, `Bio must not exceed ${BIO_MAX_LENGTH} characters.`)
    .optional()
    .or(z.literal('')),
})

export type UpdateProfileFormValues = z.infer<typeof updateProfileSchema>
