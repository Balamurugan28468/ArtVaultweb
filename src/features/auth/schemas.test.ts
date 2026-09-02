import { describe, expect, it } from 'vitest'
import { signInSchema, signUpSchema } from './schemas'

describe('signInSchema', () => {
  it('rejects an empty email with a specific message', () => {
    const result = signInSchema.safeParse({ email: '', password: 'anything' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Email is required.')
  })

  it('rejects a malformed email', () => {
    const result = signInSchema.safeParse({ email: 'not-an-email', password: 'anything' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Enter a valid email address.')
  })

  it('rejects an empty password with a specific message', () => {
    const result = signInSchema.safeParse({ email: 'alice@example.com', password: '' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Password is required.')
  })

  it('accepts a valid email/password pair', () => {
    const result = signInSchema.safeParse({ email: 'alice@example.com', password: 'secret123' })
    expect(result.success).toBe(true)
  })

  it('does not apply sign-up password complexity rules to sign-in — a simple, older password must still work', () => {
    const result = signInSchema.safeParse({ email: 'alice@example.com', password: 'alllowercase' })
    expect(result.success).toBe(true)
  })

  it('trims and lowercases the email for consistent matching', () => {
    const result = signInSchema.safeParse({ email: '  Alice@Example.com  ', password: 'secret123' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.email).toBe('alice@example.com')
  })
})

describe('signUpSchema', () => {
  const valid = {
    displayName: 'Alice',
    email: 'alice@example.com',
    password: 'Longenough1',
    confirmPassword: 'Longenough1',
  }

  describe('displayName', () => {
    it('rejects an empty name with a specific message', () => {
      const result = signUpSchema.safeParse({ ...valid, displayName: '' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Name is required.')
    })

    it('rejects a whitespace-only name as required', () => {
      const result = signUpSchema.safeParse({ ...valid, displayName: '   ' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Name is required.')
    })

    it('rejects a name that is too short', () => {
      const result = signUpSchema.safeParse({ ...valid, displayName: 'A' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Name must be at least 2 characters.')
    })

    it('accepts a valid name', () => {
      expect(signUpSchema.safeParse(valid).success).toBe(true)
    })
  })

  describe('email', () => {
    it('rejects an empty email', () => {
      const result = signUpSchema.safeParse({ ...valid, email: '' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Email is required.')
    })

    it('rejects a malformed email', () => {
      const result = signUpSchema.safeParse({ ...valid, email: 'not-an-email' })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.message).toBe('Enter a valid email address.')
    })
  })

  describe('password', () => {
    it('rejects an empty password', () => {
      const result = signUpSchema.safeParse({ ...valid, password: '', confirmPassword: '' })
      expect(result.success).toBe(false)
      const passwordIssue = !result.success && result.error.issues.find((issue) => issue.path[0] === 'password')
      expect(passwordIssue && passwordIssue.message).toBe('Password is required.')
    })

    it('rejects a password shorter than 8 characters', () => {
      const result = signUpSchema.safeParse({ ...valid, password: 'Short1', confirmPassword: 'Short1' })
      expect(result.success).toBe(false)
      const passwordIssue = !result.success && result.error.issues.find((issue) => issue.path[0] === 'password')
      expect(passwordIssue && passwordIssue.message).toBe('Password must be at least 8 characters.')
    })

    it('rejects a password missing an uppercase letter', () => {
      const result = signUpSchema.safeParse({ ...valid, password: 'longenough1', confirmPassword: 'longenough1' })
      expect(result.success).toBe(false)
      const passwordIssue = !result.success && result.error.issues.find((issue) => issue.path[0] === 'password')
      expect(passwordIssue && passwordIssue.message).toBe('Password must contain at least one uppercase letter.')
    })

    it('rejects a password missing a lowercase letter', () => {
      const result = signUpSchema.safeParse({ ...valid, password: 'LONGENOUGH1', confirmPassword: 'LONGENOUGH1' })
      expect(result.success).toBe(false)
      const passwordIssue = !result.success && result.error.issues.find((issue) => issue.path[0] === 'password')
      expect(passwordIssue && passwordIssue.message).toBe('Password must contain at least one lowercase letter.')
    })

    it('rejects a password missing a number', () => {
      const result = signUpSchema.safeParse({ ...valid, password: 'Longenough', confirmPassword: 'Longenough' })
      expect(result.success).toBe(false)
      const passwordIssue = !result.success && result.error.issues.find((issue) => issue.path[0] === 'password')
      expect(passwordIssue && passwordIssue.message).toBe('Password must contain at least one number.')
    })

    it('accepts a password meeting every requirement', () => {
      expect(signUpSchema.safeParse(valid).success).toBe(true)
    })
  })

  describe('confirmPassword', () => {
    it('rejects an empty confirm-password field', () => {
      const result = signUpSchema.safeParse({ ...valid, confirmPassword: '' })
      expect(result.success).toBe(false)
      const issue = !result.success && result.error.issues.find((i) => i.path[0] === 'confirmPassword')
      expect(issue && issue.message).toBe('Please confirm your password.')
    })

    it('rejects mismatched passwords', () => {
      const result = signUpSchema.safeParse({ ...valid, confirmPassword: 'Different1' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(['confirmPassword'])
        expect(result.error.issues[0]?.message).toBe('Passwords do not match.')
      }
    })
  })

  it('accepts a fully valid sign-up submission', () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true)
  })
})
