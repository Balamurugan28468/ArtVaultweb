import { z } from 'zod'
import { integerField, requiredTextField } from '@/shared/validation/fields'

export const ARTWORK_TITLE_MIN_LENGTH = 2
export const ARTWORK_TITLE_MAX_LENGTH = 100
export const ARTWORK_DESCRIPTION_MIN_LENGTH = 10
export const ARTWORK_DESCRIPTION_MAX_LENGTH = 2000
export const ARTWORK_MAX_TAGS = 10
export const ARTWORK_TAG_MAX_LENGTH = 30

/** Splits a comma-separated tags input into a trimmed, deduplicated, non-empty list. */
export function parseTags(raw: string): string[] {
  return Array.from(new Set(raw.split(',').map((tag) => tag.trim()).filter(Boolean)))
}

function tagsField() {
  return z.string().superRefine((value, ctx) => {
    const tags = parseTags(value)
    if (tags.length > ARTWORK_MAX_TAGS) {
      ctx.addIssue({ code: 'custom', message: `Add up to ${ARTWORK_MAX_TAGS} tags.` })
      return
    }
    if (tags.some((tag) => tag.length > ARTWORK_TAG_MAX_LENGTH)) {
      ctx.addIssue({ code: 'custom', message: `Each tag must be ${ARTWORK_TAG_MAX_LENGTH} characters or fewer.` })
    }
  })
}

// Category is validated for "something was chosen" here; the fixed set of
// valid values is enforced where it actually matters — firestore.rules and
// isArtworkCategory() — since the <select> UI can only ever offer real
// options anyway. Keeps the shared error message centralized rather than
// duplicating the category list into the validation layer too.
const categoryField = () => z.string().min(1, 'Select a category.')

export const artworkDraftSchema = z.object({
  title: requiredTextField({ label: 'Title', min: ARTWORK_TITLE_MIN_LENGTH, max: ARTWORK_TITLE_MAX_LENGTH }),
  description: requiredTextField({
    label: 'Description',
    min: ARTWORK_DESCRIPTION_MIN_LENGTH,
    max: ARTWORK_DESCRIPTION_MAX_LENGTH,
  }),
  // Whole rupees as typed by the seller — converted to integer paise (× 100)
  // only where the write payload is actually built (ArtworkForm's submit
  // handler), never stored or compared as a float anywhere in between.
  price: integerField({ label: 'Price', min: 1 }),
  category: categoryField(),
  tags: tagsField(),
  inventoryCount: integerField({ label: 'Inventory count', min: 0 }),
})

export type ArtworkDraftFormValues = z.infer<typeof artworkDraftSchema>
