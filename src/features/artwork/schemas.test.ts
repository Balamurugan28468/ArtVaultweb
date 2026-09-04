import { describe, expect, it } from 'vitest'
import { artworkDraftSchema, parseTags } from './schemas'

describe('parseTags', () => {
  it('splits, trims, and dedupes comma-separated tags', () => {
    expect(parseTags('abstract, blue,  abstract , canvas')).toEqual(['abstract', 'blue', 'canvas'])
  })

  it('returns an empty array for an empty or whitespace-only input', () => {
    expect(parseTags('')).toEqual([])
    expect(parseTags('   ')).toEqual([])
  })

  it('ignores empty entries from stray commas', () => {
    expect(parseTags('abstract,, ,blue')).toEqual(['abstract', 'blue'])
  })
})

describe('artworkDraftSchema', () => {
  const valid = {
    title: 'Sunset Over the Bay',
    description: 'An oil painting capturing golden hour light over the water.',
    price: '1500',
    category: 'painting',
    tags: 'abstract, blue',
    inventoryCount: '1',
  }

  it('accepts a fully valid artwork draft', () => {
    expect(artworkDraftSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts empty tags — tags are optional', () => {
    expect(artworkDraftSchema.safeParse({ ...valid, tags: '' }).success).toBe(true)
  })

  it('accepts an inventory count of exactly zero', () => {
    expect(artworkDraftSchema.safeParse({ ...valid, inventoryCount: '0' }).success).toBe(true)
  })

  describe('title', () => {
    it('rejects an empty title', () => {
      const result = artworkDraftSchema.safeParse({ ...valid, title: '' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Title is required.')
    })

    it('rejects a title that is too short', () => {
      const result = artworkDraftSchema.safeParse({ ...valid, title: 'A' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Title must be at least 2 characters.')
    })
  })

  describe('description', () => {
    it('rejects an empty description', () => {
      const result = artworkDraftSchema.safeParse({ ...valid, description: '' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Description is required.')
    })

    it('rejects a description that is too short', () => {
      const result = artworkDraftSchema.safeParse({ ...valid, description: 'short' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Description must be at least 10 characters.')
    })
  })

  describe('price', () => {
    it('rejects an empty price', () => {
      const result = artworkDraftSchema.safeParse({ ...valid, price: '' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Price is required.')
    })

    it('rejects a non-numeric price', () => {
      const result = artworkDraftSchema.safeParse({ ...valid, price: 'free' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Price must be a whole number.')
    })

    it('rejects a decimal price', () => {
      const result = artworkDraftSchema.safeParse({ ...valid, price: '19.99' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Price must be a whole number.')
    })

    it('rejects a zero price — must be at least 1', () => {
      const result = artworkDraftSchema.safeParse({ ...valid, price: '0' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Price must be at least 1.')
    })
  })

  describe('category', () => {
    it('rejects an unselected category', () => {
      const result = artworkDraftSchema.safeParse({ ...valid, category: '' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Select a category.')
    })
  })

  describe('tags', () => {
    it('rejects more than 10 tags', () => {
      const manyTags = Array.from({ length: 11 }, (_, i) => `tag${i}`).join(', ')
      const result = artworkDraftSchema.safeParse({ ...valid, tags: manyTags })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Add up to 10 tags.')
    })

    it('rejects a tag longer than 30 characters', () => {
      const result = artworkDraftSchema.safeParse({ ...valid, tags: 'x'.repeat(31) })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Each tag must be 30 characters or fewer.')
    })
  })

  describe('inventoryCount', () => {
    it('rejects an empty inventory count', () => {
      const result = artworkDraftSchema.safeParse({ ...valid, inventoryCount: '' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Inventory count is required.')
    })

    it('rejects a negative inventory count as non-numeric (no minus sign accepted)', () => {
      const result = artworkDraftSchema.safeParse({ ...valid, inventoryCount: '-1' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Inventory count must be a whole number.')
    })
  })
})
