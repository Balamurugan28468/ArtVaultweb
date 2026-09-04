import { describe, expect, it } from 'vitest'
import { sellerApplicationSchema } from './schemas'

describe('sellerApplicationSchema', () => {
  const valid = {
    businessName: 'Alice Fine Art',
    description: 'I paint contemporary landscapes in oil and acrylic.',
    contactEmail: 'alice@example.com',
  }

  it('accepts a fully valid application', () => {
    expect(sellerApplicationSchema.safeParse(valid).success).toBe(true)
  })

  describe('businessName', () => {
    it('rejects an empty business name with a specific message', () => {
      const result = sellerApplicationSchema.safeParse({ ...valid, businessName: '' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Business name is required.')
    })

    it('rejects a whitespace-only business name as required', () => {
      const result = sellerApplicationSchema.safeParse({ ...valid, businessName: '   ' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Business name is required.')
    })

    it('rejects a business name that is too short', () => {
      const result = sellerApplicationSchema.safeParse({ ...valid, businessName: 'A' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Business name must be at least 2 characters.')
    })

    it('rejects a business name that is too long', () => {
      const result = sellerApplicationSchema.safeParse({ ...valid, businessName: 'x'.repeat(81) })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Business name is too long.')
    })
  })

  describe('description', () => {
    it('rejects an empty description', () => {
      const result = sellerApplicationSchema.safeParse({ ...valid, description: '' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Seller description is required.')
    })

    it('rejects a description that is too short', () => {
      const result = sellerApplicationSchema.safeParse({ ...valid, description: 'Too short' })
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.issues[0]?.message).toBe('Seller description must be at least 10 characters.')
    })

    it('rejects a description that is too long', () => {
      const result = sellerApplicationSchema.safeParse({ ...valid, description: 'x'.repeat(501) })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Seller description is too long.')
    })
  })

  describe('contactEmail', () => {
    it('rejects an empty contact email', () => {
      const result = sellerApplicationSchema.safeParse({ ...valid, contactEmail: '' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Email is required.')
    })

    it('rejects a malformed contact email', () => {
      const result = sellerApplicationSchema.safeParse({ ...valid, contactEmail: 'not-an-email' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Enter a valid email address.')
    })

    it('trims and lowercases a valid contact email', () => {
      const result = sellerApplicationSchema.safeParse({ ...valid, contactEmail: '  Alice@Example.COM  ' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.contactEmail).toBe('alice@example.com')
    })
  })
})
