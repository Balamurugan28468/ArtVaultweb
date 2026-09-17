import { describe, expect, it } from 'vitest'
import { getRedirectPath } from './returnTo'
describe('safe authentication return destination', () => {
  it.each(['/cart', '/checkout?step=address#shipping'])('preserves %s', (from) => {
    expect(getRedirectPath({ from })).toBe(from)
  })
  it.each([null, undefined, {}, { from: 42 }, { from: 'https://example.com' }, { from: '//example.com' }, { from: '/\\example.com' }, { from: '/sign-in' }, { from: '/sign-up?x=1' }, { from: '/ checkout' }])('rejects unsafe or malformed state %j', (state) => {
    expect(getRedirectPath(state)).toBe('/account')
  })
})
