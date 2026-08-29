import { describe, expect, it } from 'vitest'
import { getRedirectPath } from './SignInPage'

describe('getRedirectPath', () => {
  it('returns the originally-requested path when RequireAuth redirected here', () => {
    expect(getRedirectPath({ from: '/account' })).toBe('/account')
  })

  it('falls back to /account when there is no redirect state', () => {
    expect(getRedirectPath(null)).toBe('/account')
    expect(getRedirectPath(undefined)).toBe('/account')
  })

  it('falls back to /account for malformed state rather than throwing', () => {
    expect(getRedirectPath({ from: 42 })).toBe('/account')
    expect(getRedirectPath('not-an-object')).toBe('/account')
  })
})
