import { z } from 'zod'
import { emailField, requiredTextField } from '@/shared/validation/fields'

export const NAME_MIN_LENGTH = 2
export const NAME_MAX_LENGTH = 60
export const SIGNUP_PASSWORD_MIN_LENGTH = 8

export const signInSchema = z.object({
  email: emailField(),
  // Deliberately no complexity requirements here — those apply only to
  // *creating* a password (sign-up), never to attempting to use an
  // existing one. An older account's password that predates this policy
  // must still be able to sign in.
  password: z.string().min(1, 'Password is required.'),
})

export type SignInInput = z.infer<typeof signInSchema>

// Checked in order, one message at a time (matches the single-message-per-
// field UI already in place) rather than collecting every failed rule at
// once.
const signupPasswordSchema = z.string().superRefine((value, ctx) => {
  if (value.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'Password is required.' })
    return
  }
  if (value.length < SIGNUP_PASSWORD_MIN_LENGTH) {
    ctx.addIssue({ code: 'custom', message: `Password must be at least ${SIGNUP_PASSWORD_MIN_LENGTH} characters.` })
    return
  }
  if (!/[A-Z]/.test(value)) {
    ctx.addIssue({ code: 'custom', message: 'Password must contain at least one uppercase letter.' })
    return
  }
  if (!/[a-z]/.test(value)) {
    ctx.addIssue({ code: 'custom', message: 'Password must contain at least one lowercase letter.' })
    return
  }
  if (!/[0-9]/.test(value)) {
    ctx.addIssue({ code: 'custom', message: 'Password must contain at least one number.' })
  }
})

export const signUpSchema = z
  .object({
    displayName: requiredTextField({ label: 'Name', min: NAME_MIN_LENGTH, max: NAME_MAX_LENGTH }),
    email: emailField(),
    password: signupPasswordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

export type SignUpInput = z.infer<typeof signUpSchema>
