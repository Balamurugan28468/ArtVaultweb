import { describe, expect, it } from 'vitest'
import { updateProfileSchema } from './schemas'

describe('updateProfileSchema', () => {
  it('accepts a valid, fully-filled submission', () => {
    const result = updateProfileSchema.safeParse({
      displayName: 'Alice',
      phoneNumber: '+1 555 0100',
      bio: 'Collector of contemporary sculpture.',
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty optional fields', () => {
    const result = updateProfileSchema.safeParse({ displayName: 'Alice', phoneNumber: '', bio: '' })
    expect(result.success).toBe(true)
  })

  describe('displayName', () => {
    it('rejects an empty display name with a specific message', () => {
      const result = updateProfileSchema.safeParse({ displayName: '', phoneNumber: '', bio: '' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Display name is required.')
    })

    it('rejects a whitespace-only display name as required, not as valid', () => {
      const result = updateProfileSchema.safeParse({ displayName: '   ', phoneNumber: '', bio: '' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Display name is required.')
    })

    it('rejects a display name that is too short with a specific message', () => {
      const result = updateProfileSchema.safeParse({ displayName: 'A', phoneNumber: '', bio: '' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Display name must be at least 2 characters.')
    })

    it('rejects a display name over the max length with a specific message', () => {
      const result = updateProfileSchema.safeParse({ displayName: 'x'.repeat(61), phoneNumber: '', bio: '' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Display name is too long.')
    })

    it('trims a display name padded with whitespace before validating length', () => {
      const result = updateProfileSchema.safeParse({ displayName: '  Alice  ', phoneNumber: '', bio: '' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.displayName).toBe('Alice')
    })

    it('accepts names with apostrophes, hyphens, periods, and initials', () => {
      for (const name of ["O'Brien", 'Jean-Luc', 'J. R. R.', 'Mary Ann']) {
        const result = updateProfileSchema.safeParse({ displayName: name, phoneNumber: '', bio: '' })
        expect(result.success).toBe(true)
      }
    })
  })

  describe('phoneNumber', () => {
    it('rejects an invalid phone number with a specific message', () => {
      const result = updateProfileSchema.safeParse({ displayName: 'Alice', phoneNumber: 'not-a-phone!!', bio: '' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Enter a valid phone number.')
    })

    it('accepts international phone formats without over-restricting them', () => {
      const result = updateProfileSchema.safeParse({ displayName: 'Alice', phoneNumber: '+91 98765 43210', bio: '' })
      expect(result.success).toBe(true)
    })

    it('treats a whitespace-only phone number as empty, not as an invalid phone number', () => {
      const result = updateProfileSchema.safeParse({ displayName: 'Alice', phoneNumber: '   ', bio: '' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.phoneNumber).toBe('')
    })

    it('rejects a phone number over the max length with a specific message', () => {
      const result = updateProfileSchema.safeParse({ displayName: 'Alice', phoneNumber: '1'.repeat(21), bio: '' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Phone number must not exceed 20 characters.')
    })
  })

  describe('bio', () => {
    it('rejects a bio over the max length with a specific message', () => {
      const result = updateProfileSchema.safeParse({ displayName: 'Alice', phoneNumber: '', bio: 'x'.repeat(281) })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Bio must not exceed 280 characters.')
    })

    it('accepts a bio at exactly the max length', () => {
      const result = updateProfileSchema.safeParse({ displayName: 'Alice', phoneNumber: '', bio: 'x'.repeat(280) })
      expect(result.success).toBe(true)
    })
  })
})
