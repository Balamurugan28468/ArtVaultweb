import { describe, expect, it } from 'vitest'
import { emailField, requiredTextField } from './fields'

describe('requiredTextField', () => {
  const field = requiredTextField({ label: 'Name', min: 2, max: 10 })

  it('rejects an empty value as required', () => {
    const result = field.safeParse('')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Name is required.')
  })

  it('rejects a whitespace-only value as required, not merely too short', () => {
    const result = field.safeParse('   ')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Name is required.')
  })

  it('rejects a value shorter than the minimum with a specific message', () => {
    const result = field.safeParse('A')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Name must be at least 2 characters.')
  })

  it('rejects a value longer than the maximum with a specific message', () => {
    const result = field.safeParse('x'.repeat(11))
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Name is too long.')
  })

  it('trims surrounding whitespace without altering internal characters', () => {
    const result = field.safeParse("  O'Brien  ")
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBe("O'Brien")
  })

  it('accepts a value at the minimum and maximum boundaries', () => {
    expect(field.safeParse('Al').success).toBe(true)
    expect(field.safeParse('x'.repeat(10)).success).toBe(true)
  })
})

describe('emailField', () => {
  const field = emailField()

  it('rejects an empty value as required', () => {
    const result = field.safeParse('')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Email is required.')
  })

  it('rejects a whitespace-only value as required', () => {
    const result = field.safeParse('   ')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Email is required.')
  })

  it('rejects a malformed email with a specific message', () => {
    const result = field.safeParse('not-an-email')
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Enter a valid email address.')
  })

  it('trims and lowercases a valid email', () => {
    const result = field.safeParse('  Alice@Example.COM  ')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBe('alice@example.com')
  })
})
