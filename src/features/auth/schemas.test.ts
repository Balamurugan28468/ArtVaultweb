import { describe, expect, it } from 'vitest'
import { signInSchema, signUpSchema } from './schemas'

describe('signInSchema', () => {
  it('rejects an invalid email', () => {
    const result = signInSchema.safeParse({ email: 'not-an-email', password: 'secret123' })
    expect(result.success).toBe(false)
  })

  it('accepts a valid email/password pair', () => {
    const result = signInSchema.safeParse({ email: 'alice@example.com', password: 'secret123' })
    expect(result.success).toBe(true)
  })
})

describe('signUpSchema', () => {
  const valid = {
    displayName: 'Alice',
    email: 'alice@example.com',
    password: 'longenough',
    confirmPassword: 'longenough',
  }

  it('accepts matching, sufficiently long passwords', () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects mismatched passwords', () => {
    const result = signUpSchema.safeParse({ ...valid, confirmPassword: 'different' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['confirmPassword'])
    }
  })

  it('rejects a password shorter than 8 characters', () => {
    const result = signUpSchema.safeParse({ ...valid, password: 'short', confirmPassword: 'short' })
    expect(result.success).toBe(false)
  })
})
