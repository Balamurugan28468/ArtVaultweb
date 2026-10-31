import { expect, it } from 'vitest'
import { signInSchema, signUpSchema } from './schemas'
import { EMAIL_OTP_LENGTH, getEmailDomainSuggestion } from './validation'

const valid = { displayName: 'Alice', email: 'alice@example.com', password: 'StrongPass1', confirmPassword: 'StrongPass1' }

it.each(['gmal.com', 'gmial.com', 'gmai.com', 'gmail.con', 'gmali.com'])('blocks %s for new signup while allowing existing identities to log in', domain => {
  const email = `alice@${domain}`
  expect(getEmailDomainSuggestion(`  Alice@${domain.toUpperCase()}  `)).toBe('gmail.com')
  expect(signUpSchema.safeParse({ ...valid, email }).success).toBe(false)
  expect(signInSchema.safeParse({ email, password: 'existing' }).success).toBe(true)
})
it.each(['a@gmail.com', 'a@outlook.com', 'a@yahoo.com', 'a@college.ac.in', "o'connor+art@company.co.uk", 'a@sub.example.org', 'alice@xn--e1afmkfd.xn--p1ai'])('accepts legitimate mailbox syntax without a provider whitelist: %s', email => {
  expect(signUpSchema.safeParse({ ...valid, email }).success).toBe(true)
  expect(getEmailDomainSuggestion(email)).toBeNull()
})
it.each(['', 'a gmail.com', 'a@', '@gmail.com', 'a@@gmail.com', 'a@-example.com', 'a@example-.com', 'a@example..com', '.a@example.com', 'a..b@example.com', 'a@exam ple.com'])('rejects malformed email: %s', email => {
  expect(signUpSchema.safeParse({ ...valid, email }).success).toBe(false)
  expect(signInSchema.safeParse({ email, password: 'existing' }).success).toBe(false)
})
it.each(['李 小龍', "María-José O’Connor", 'أحمد علي', 'अनन्या शर्मा', 'Jean-Luc Picard'])('preserves an international name: %s', displayName => {
  const result = signUpSchema.parse({ ...valid, displayName: ` ${displayName} ` })
  expect(result.displayName).toBe(displayName)
})
it.each(['', '   ', 'A', 'A'.repeat(61), 'Alice\u0000Smith', 'Alice\nSmith', '\tAlice'])('rejects missing, overlong or control-character names', displayName => {
  expect(signUpSchema.safeParse({ ...valid, displayName }).success).toBe(false)
})
it('preserves passwords byte for byte and requires an exact confirmation', () => {
  const password = ' StrongPass1 '
  expect(signUpSchema.parse({ ...valid, password, confirmPassword: password }).password).toBe(password)
  expect(signUpSchema.safeParse({ ...valid, password, confirmPassword: password.trim() }).success).toBe(false)
})
it('matches the six-digit hosted Email OTP setting confirmed by the owner', () => {
  expect(EMAIL_OTP_LENGTH).toBe(6)
})
