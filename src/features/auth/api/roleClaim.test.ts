import type { AuthUser } from '../types'
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc,
  }),
}))

import {
  getCurrentRoleClaim,
  waitForRoleClaim,
} from './roleClaim'

const fakeUser: AuthUser = {
  id: 'user-1',
  uid: 'user-1',
  email: 'alice@example.com',
  displayName: 'Alice',
  photoURL: null,
  phoneNumber: null,
  emailVerified: true,
  createdAt: '2026-09-19T00:00:00.000Z',
}

beforeEach(() => {
  rpc.mockReset()
})

describe('getCurrentRoleClaim', () => {
  it('returns the role when the RPC returns a recognized role', async () => {
    rpc.mockResolvedValueOnce({
      data: 'CUSTOMER',
      error: null,
    })

    await expect(
      getCurrentRoleClaim(fakeUser),
    ).resolves.toBe('CUSTOMER')

    expect(rpc).toHaveBeenCalledTimes(1)

    expect(rpc).toHaveBeenCalledWith(
      'current_app_role',
    )
  })

  it('normalizes a lowercase role returned by the RPC', async () => {
    rpc.mockResolvedValueOnce({
      data: 'seller',
      error: null,
    })

    await expect(
      getCurrentRoleClaim(fakeUser),
    ).resolves.toBe('SELLER')
  })

  it('returns null when the RPC value is missing', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: null,
    })

    await expect(
      getCurrentRoleClaim(fakeUser),
    ).resolves.toBeNull()
  })

  it('returns null when the RPC value is not a recognized role', async () => {
    rpc.mockResolvedValueOnce({
      data: 'INVALID_ROLE',
      error: null,
    })

    await expect(
      getCurrentRoleClaim(fakeUser),
    ).resolves.toBeNull()
  })

  it('throws when Supabase returns an RPC error', async () => {
    const error = {
      message: 'RPC failed',
      code: '500',
    }

    rpc.mockResolvedValueOnce({
      data: null,
      error,
    })

    await expect(
      getCurrentRoleClaim(fakeUser),
    ).rejects.toBe(error)
  })
})

describe('waitForRoleClaim', () => {
  it('retries until the role becomes available', async () => {
    rpc
      .mockResolvedValueOnce({
        data: null,
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: null,
      })
      .mockResolvedValueOnce({
        data: 'CUSTOMER',
        error: null,
      })

    const role = await waitForRoleClaim(
      fakeUser,
      {
        retries: 5,
        delayMs: 0,
      },
    )

    expect(role).toBe('CUSTOMER')
    expect(rpc).toHaveBeenCalledTimes(3)

    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'current_app_role',
    )

    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'current_app_role',
    )

    expect(rpc).toHaveBeenNthCalledWith(
      3,
      'current_app_role',
    )
  })

  it('returns null once the retry budget is exhausted', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: null,
    })

    const role = await waitForRoleClaim(
      fakeUser,
      {
        retries: 2,
        delayMs: 0,
      },
    )

    expect(role).toBeNull()
    expect(rpc).toHaveBeenCalledTimes(3)
  })

  it('retries transient RPC errors and returns the role if a later attempt succeeds', async () => {
    rpc
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Temporary failure',
        },
      })
      .mockResolvedValueOnce({
        data: 'SELLER',
        error: null,
      })

    const role = await waitForRoleClaim(
      fakeUser,
      {
        retries: 2,
        delayMs: 0,
      },
    )

    expect(role).toBe('SELLER')
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('throws the last RPC error when all retries fail', async () => {
    const error = {
      message: 'Role lookup failed',
    }

    rpc.mockResolvedValue({
      data: null,
      error,
    })

    await expect(
      waitForRoleClaim(
        fakeUser,
        {
          retries: 2,
          delayMs: 0,
        },
      ),
    ).rejects.toBe(error)

    expect(rpc).toHaveBeenCalledTimes(3)
  })
})