import { z } from 'zod'

/**
 * A required, trimmed text field (a person's name, a display name, ...)
 * with distinct messages for "empty", "too short", and "too long" — rather
 * than one generic message covering all three, or a character-class
 * restriction that would reject legitimate names containing spaces,
 * apostrophes, hyphens, periods, or initials.
 */
export function requiredTextField({ label, min, max }: { label: string; min: number; max: number }) {
  return z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (value.length === 0) {
        ctx.addIssue({ code: 'custom', message: `${label} is required.` })
        return
      }
      if (value.length < min) {
        ctx.addIssue({ code: 'custom', message: `${label} must be at least ${min} characters.` })
        return
      }
      if (value.length > max) {
        ctx.addIssue({ code: 'custom', message: `${label} is too long.` })
      }
    })
}

// Deliberately simple shape-check (not a full RFC 5322 implementation) —
// client-side format validation can only ever prove an address is
// well-formed, never that it exists or is reachable.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * A required email field: trimmed, format-checked, and lowercased for
 * normalization (matches Firebase Auth's own case-insensitive handling —
 * this never changes which account is being addressed, only how the
 * client presents what the user typed).
 */
export function emailField() {
  return z
    .string()
    .trim()
    .toLowerCase()
    .superRefine((value, ctx) => {
      if (value.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'Email is required.' })
        return
      }
      if (!EMAIL_PATTERN.test(value)) {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid email address.' })
      }
    })
}

/**
 * A required whole-number field (price, inventory count, ...). Deliberately
 * kept as a validated *string* — not `.transform(Number)`'d — so the form's
 * managed value type never diverges from its schema's input type (a
 * transform would need react-hook-form's separate input/output generics,
 * which nothing else in this codebase uses yet); callers convert to a
 * number once, at the point they actually build the write payload.
 */
export function integerField({ label, min }: { label: string; min: number }) {
  return z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (value.length === 0) {
        ctx.addIssue({ code: 'custom', message: `${label} is required.` })
        return
      }
      if (!/^\d+$/.test(value)) {
        ctx.addIssue({ code: 'custom', message: `${label} must be a whole number.` })
        return
      }
      if (Number(value) < min) {
        ctx.addIssue({
          code: 'custom',
          message: min === 0 ? `${label} cannot be negative.` : `${label} must be at least ${min}.`,
        })
      }
    })
}
