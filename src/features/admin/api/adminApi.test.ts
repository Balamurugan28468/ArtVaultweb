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

vi.mock(
  '@/lib/supabase/data',
  () => ({
    rpc,
  }),
)

const {
  approveSellerApplication,
  isAdminActionError,
  moderateArtwork,
  moderateUser,
  rejectSellerApplication,
  restoreArtwork,
  setUserRole,
  suspendArtwork,
  suspendSeller,
} = await import('./adminApi')

beforeEach(() => {
  rpc.mockReset()
})

describe(
  'adminApi — approveSellerApplication',
  () => {
    it('calls the trusted review_seller RPC with an APPROVED decision', async () => {
      rpc.mockResolvedValueOnce(
        undefined,
      )

      await approveSellerApplication(
        'alice',
      )

      expect(
        rpc,
      ).toHaveBeenCalledTimes(1)

      expect(
        rpc,
      ).toHaveBeenCalledWith(
        'review_seller',
        {
          target: 'alice',
          decision: 'APPROVED',
        },
      )
    })

    it('propagates the typed Supabase/RPC error', async () => {
      const error = {
        code: 'unknown',
        message:
          'Seller application for uid=alice is already approved.',
      }

      rpc.mockRejectedValueOnce(
        error,
      )

      await expect(
        approveSellerApplication(
          'alice',
        ),
      ).rejects.toEqual(
        error,
      )
    })
  },
)

describe(
  'adminApi — rejectSellerApplication',
  () => {
    it('calls the trusted review_seller RPC with the rejection reason', async () => {
      rpc.mockResolvedValueOnce(
        undefined,
      )

      await rejectSellerApplication(
        'alice',
        'Not a fit.',
      )

      expect(
        rpc,
      ).toHaveBeenCalledWith(
        'review_seller',
        {
          target: 'alice',
          decision: 'REJECTED',
          reason: 'Not a fit.',
        },
      )
    })

    it('propagates a permission-denied error from the trusted backend', async () => {
      const error = {
        code: 'permission-denied',
        message:
          'You do not have permission to do that.',
      }

      rpc.mockRejectedValueOnce(
        error,
      )

      await expect(
        rejectSellerApplication(
          'alice',
          'x',
        ),
      ).rejects.toEqual(
        error,
      )
    })
  },
)

describe(
  'adminApi — moderateArtwork',
  () => {
    it('publishes through moderate_artwork without inventing a rejection reason', async () => {
      rpc.mockResolvedValueOnce(
        undefined,
      )

      await moderateArtwork(
        'a1',
        'PUBLISHED',
      )

      expect(
        rpc,
      ).toHaveBeenCalledWith(
        'moderate_artwork',
        {
          target: 'a1',
          decision: 'PUBLISHED',
          reason: null,
        },
      )
    })

    it('passes the rejection reason when rejecting an artwork', async () => {
      rpc.mockResolvedValueOnce(
        undefined,
      )

      await moderateArtwork(
        'a1',
        'REJECTED',
        'blurry photos',
      )

      expect(
        rpc,
      ).toHaveBeenCalledWith(
        'moderate_artwork',
        {
          target: 'a1',
          decision: 'REJECTED',
          reason: 'blurry photos',
        },
      )
    })

    it('propagates a trusted backend error instead of fabricating success', async () => {
      const error = {
        code: 'unknown',
        message:
          'No artwork found for artworkId=ghost.',
      }

      rpc.mockRejectedValueOnce(
        error,
      )

      await expect(
        moderateArtwork(
          'ghost',
          'PUBLISHED',
        ),
      ).rejects.toEqual(
        error,
      )
    })
  },
)

describe(
  'adminApi — suspendArtwork',
  () => {
    it('uses the protected moderate_artwork RPC with SUSPENDED', async () => {
      rpc.mockResolvedValueOnce(
        undefined,
      )

      await suspendArtwork(
        'a1',
        'Reported for a policy violation.',
      )

      expect(
        rpc,
      ).toHaveBeenCalledWith(
        'moderate_artwork',
        {
          target: 'a1',
          decision: 'SUSPENDED',
          reason:
            'Reported for a policy violation.',
        },
      )
    })

    it('propagates the permission error returned by the Supabase boundary', async () => {
      const error = {
        code: 'permission-denied',
        message:
          'You do not have permission to do that.',
      }

      rpc.mockRejectedValueOnce(
        error,
      )

      await expect(
        suspendArtwork(
          'a1',
          'x',
        ),
      ).rejects.toEqual(
        error,
      )
    })

    it('propagates an already-suspended backend failure without changing it', async () => {
      const error = {
        code: 'unknown',
        message:
          'Artwork a1 is already suspended.',
      }

      rpc.mockRejectedValueOnce(
        error,
      )

      await expect(
        suspendArtwork(
          'a1',
          'x',
        ),
      ).rejects.toEqual(
        error,
      )
    })
  },
)

describe('adminApi — suspendSeller', () => {
  it('calls review_seller RPC with SUSPENDED decision and reason', async () => {
    rpc.mockResolvedValueOnce(undefined)

    await suspendSeller('seller123', 'Repeated policy violations')

    expect(rpc).toHaveBeenCalledWith('review_seller', {
      target: 'seller123',
      decision: 'SUSPENDED',
      reason: 'Repeated policy violations',
    })
  })
})

describe('adminApi — restoreArtwork', () => {
  it('calls moderate_artwork RPC with RESTORE decision', async () => {
    rpc.mockResolvedValueOnce(undefined)

    await restoreArtwork('art123')

    expect(rpc).toHaveBeenCalledWith('moderate_artwork', {
      target: 'art123',
      decision: 'RESTORE',
    })
  })
})

describe('adminApi — moderateUser', () => {
  it('calls moderate_user RPC with SUSPENDED decision and reason', async () => {
    rpc.mockResolvedValueOnce(undefined)

    await moderateUser('user123', 'SUSPENDED', 'Fraudulent chargeback activity')

    expect(rpc).toHaveBeenCalledWith('moderate_user', {
      target: 'user123',
      decision: 'SUSPENDED',
      reason: 'Fraudulent chargeback activity',
    })
  })

  it('calls moderate_user RPC with ACTIVE decision to reactivate', async () => {
    rpc.mockResolvedValueOnce(undefined)

    await moderateUser('user123', 'ACTIVE')

    expect(rpc).toHaveBeenCalledWith('moderate_user', {
      target: 'user123',
      decision: 'ACTIVE',
      reason: null,
    })
  })
})

describe('adminApi — setUserRole', () => {
  it('calls set_user_role RPC with target and new role', async () => {
    rpc.mockResolvedValueOnce(undefined)

    await setUserRole('user123', 'ADMIN')

    expect(rpc).toHaveBeenCalledWith('set_user_role', {
      target: 'user123',
      new_role: 'ADMIN',
    })
  })
})

describe(
  'isAdminActionError',
  () => {
    it('recognizes an AdminActionError shape', () => {
      expect(
        isAdminActionError({
          message: 'x',
        }),
      ).toBe(true)
    })

    it('rejects anything without a string message', () => {
      expect(
        isAdminActionError(null),
      ).toBe(false)

      expect(
        isAdminActionError(undefined),
      ).toBe(false)

      expect(
        isAdminActionError('x'),
      ).toBe(false)

      expect(
        isAdminActionError({
          message: 42,
        }),
      ).toBe(false)
    })
  },
)