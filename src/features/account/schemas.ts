import { z } from 'zod'

export const DISPLAY_NAME_MIN_LENGTH = 2
export const DISPLAY_NAME_MAX_LENGTH = 60
export const BIO_MAX_LENGTH = 280
export const PHONE_MAX_LENGTH = 20

// Deliberately loose: digits, spaces, +, -, and parentheses, 6-20 characters.
// Not tied to one country's format — validated for shape, not dialability.
const PHONE_PATTERN = /^[0-9+()\-\s]{6,20}$/

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(DISPLAY_NAME_MIN_LENGTH, `Enter at least ${DISPLAY_NAME_MIN_LENGTH} characters`)
    .max(DISPLAY_NAME_MAX_LENGTH, `Keep it under ${DISPLAY_NAME_MAX_LENGTH} characters`),
  phoneNumber: z
    .string()
    .trim()
    .max(PHONE_MAX_LENGTH, `Keep it under ${PHONE_MAX_LENGTH} characters`)
    .regex(PHONE_PATTERN, 'Enter a valid phone number')
    .optional()
    .or(z.literal('')),
  bio: z
    .string()
    .trim()
    .max(BIO_MAX_LENGTH, `Keep it under ${BIO_MAX_LENGTH} characters`)
    .optional()
    .or(z.literal('')),
})

export type UpdateProfileFormValues = z.infer<typeof updateProfileSchema>
