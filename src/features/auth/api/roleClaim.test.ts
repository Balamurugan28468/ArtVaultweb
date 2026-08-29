import type { User } from 'firebase/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getIdTokenResult = vi.fn()

vi.mock('firebase/auth', () => ({ getIdTokenResult: (...args: unknown[]) => getIdTokenResult(...args) }))

const { getCurrentRoleClaim, waitForRoleClaim } = await import('./roleClaim')

const fakeUser = {} as User

beforeEach(() => {
  getIdTokenResult.mockReset()
})

describe('getCurrentRoleClaim', () => {
  it('returns the role when it is a recognized value', async () => {
    getIdTokenResult.mockResolvedValueOnce({ claims: { role: 'CUSTOMER' } })
    await expect(getCurrentRoleClaim(fakeUser)).resolves.toBe('CUSTOMER')
  })

  it('returns null when the claim is missing or unrecognized', async () => {
    getIdTokenResult.mockResolvedValueOnce({ claims: {} })
    await expect(getCurrentRoleClaim(fakeUser)).resolves.toBeNull()
  })
})

describe('waitForRoleClaim', () => {
  it('retries with a forced refresh until the claim appears', async () => {
    getIdTokenResult
      .mockResolvedValueOnce({ claims: {} })
      .mockResolvedValueOnce({ claims: {} })
      .mockResolvedValueOnce({ claims: { role: 'CUSTOMER' } })

    const role = await waitForRoleClaim(fakeUser, { retries: 5, delayMs: 0 })

    expect(role).toBe('CUSTOMER')
    expect(getIdTokenResult).toHaveBeenCalledTimes(3)
    expect(getIdTokenResult).toHaveBeenNthCalledWith(1, fakeUser, false)
    expect(getIdTokenResult).toHaveBeenNthCalledWith(2, fakeUser, true)
  })

  it('gives up and returns null once the retry budget is exhausted', async () => {
    getIdTokenResult.mockResolvedValue({ claims: {} })

    const role = await waitForRoleClaim(fakeUser, { retries: 2, delayMs: 0 })

    expect(role).toBeNull()
    expect(getIdTokenResult).toHaveBeenCalledTimes(3)
  })
})
