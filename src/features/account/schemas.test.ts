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

  it('rejects a display name that is too short', () => {
    const result = updateProfileSchema.safeParse({ displayName: 'A', phoneNumber: '', bio: '' })
    expect(result.success).toBe(false)
  })

  it('rejects a display name over the max length', () => {
    const result = updateProfileSchema.safeParse({ displayName: 'x'.repeat(61), phoneNumber: '', bio: '' })
    expect(result.success).toBe(false)
  })

  it('trims a display name padded with whitespace before validating length', () => {
    const result = updateProfileSchema.safeParse({ displayName: '  Alice  ', phoneNumber: '', bio: '' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.displayName).toBe('Alice')
  })

  it('rejects an invalid phone number', () => {
    const result = updateProfileSchema.safeParse({ displayName: 'Alice', phoneNumber: 'not-a-phone!!', bio: '' })
    expect(result.success).toBe(false)
  })

  it('accepts international phone formats without over-restricting them', () => {
    const result = updateProfileSchema.safeParse({ displayName: 'Alice', phoneNumber: '+91 98765 43210', bio: '' })
    expect(result.success).toBe(true)
  })

  it('rejects a bio over the max length', () => {
    const result = updateProfileSchema.safeParse({ displayName: 'Alice', phoneNumber: '', bio: 'x'.repeat(281) })
    expect(result.success).toBe(false)
  })

  it('accepts a bio at exactly the max length', () => {
    const result = updateProfileSchema.safeParse({ displayName: 'Alice', phoneNumber: '', bio: 'x'.repeat(280) })
    expect(result.success).toBe(true)
  })
})
