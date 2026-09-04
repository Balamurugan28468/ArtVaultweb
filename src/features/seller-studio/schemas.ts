import { z } from 'zod'
import { emailField, requiredTextField } from '@/shared/validation/fields'

export const BUSINESS_NAME_MIN_LENGTH = 2
export const BUSINESS_NAME_MAX_LENGTH = 80
export const SELLER_DESCRIPTION_MIN_LENGTH = 10
export const SELLER_DESCRIPTION_MAX_LENGTH = 500

export const sellerApplicationSchema = z.object({
  businessName: requiredTextField({
    label: 'Business name',
    min: BUSINESS_NAME_MIN_LENGTH,
    max: BUSINESS_NAME_MAX_LENGTH,
  }),
  description: requiredTextField({
    label: 'Seller description',
    min: SELLER_DESCRIPTION_MIN_LENGTH,
    max: SELLER_DESCRIPTION_MAX_LENGTH,
  }),
  // Prefilled from the signed-in user's own account email (see
  // SellerApplicationForm) so a returning applicant never has to retype data
  // ArtVault already has — still editable, since a seller's business contact
  // address may legitimately differ from their login email.
  contactEmail: emailField(),
})

export type SellerApplicationFormValues = z.infer<typeof sellerApplicationSchema>
