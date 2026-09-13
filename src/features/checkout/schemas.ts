import { z } from 'zod'
import { requiredTextField } from '@/shared/validation/fields'

// UI-02 — Checkout's Shipping Address form. Deliberately session-only: no
// `addresses` Firestore collection exists anywhere in this codebase (see
// firestore.rules), so this form never claims to save an address for reuse
// on a future order — see CheckoutPage's own note to that effect, right
// next to this form. Building that persistence wasn't "absolutely
// required" for Checkout to function (a plain per-order form still lets a
// real order be reviewed), so it stays out of scope here rather than
// inventing backend the rest of UI-02 doesn't need (see the owner's own
// "Do not invent address persistence if backend support is absent" rule).

const POSTAL_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\s-]{2,9}$/

export const shippingAddressSchema = z.object({
  fullName: requiredTextField({ label: 'Full name', min: 2, max: 80 }),
  addressLine1: requiredTextField({ label: 'Address line 1', min: 3, max: 120 }),
  addressLine2: z.string().trim().max(120, 'Address line 2 is too long.').optional().or(z.literal('')),
  city: requiredTextField({ label: 'City', min: 2, max: 60 }),
  state: requiredTextField({ label: 'State / Province', min: 2, max: 60 }),
  postalCode: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (value.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'Postal code is required.' })
        return
      }
      if (!POSTAL_CODE_PATTERN.test(value)) {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid postal code.' })
      }
    }),
  country: requiredTextField({ label: 'Country', min: 2, max: 60 }),
  phone: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (value.length === 0) return
      if (!/^[0-9+()\-\s]{6,20}$/.test(value)) {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number.' })
      }
    })
    .optional(),
})

export type ShippingAddressFormValues = z.infer<typeof shippingAddressSchema>
