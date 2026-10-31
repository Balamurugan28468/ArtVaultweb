import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient:
    vi.fn(),

  from:
    vi.fn(),

  select:
    vi.fn(),

  eq:
    vi.fn(),

  maybeSingle:
    vi.fn(),

  insert:
    vi.fn(),

  deleteQuery:
    vi.fn(),

  result:
    vi.fn(),

  rpc:
    vi.fn(),
}))

vi.mock(
  '@/lib/supabase/client',
  () => ({
    createClient:
      mocks.createClient,
  }),
)

vi.mock(
  '@/lib/supabase/data',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/lib/supabase/data')
      >()

    return {
      ...actual,

      result:
        mocks.result,

      rpc:
        mocks.rpc,
    }
  },
)

const {
  getAuthoritativeLikeState,
  hasLiked,
  likeArtwork,
  toLikeError,
  unlikeArtwork,
} = await import(
  './likeRepository'
)

const builder = {
  select:
    mocks.select,

  eq:
    mocks.eq,

  maybeSingle:
    mocks.maybeSingle,

  insert:
    mocks.insert,

  delete:
    mocks.deleteQuery,
}

beforeEach(() => {
  vi.clearAllMocks()

  mocks.createClient.mockReturnValue({
    from:
      mocks.from,
  })

  mocks.from.mockReturnValue(
    builder,
  )

  mocks.select.mockReturnValue(
    builder,
  )

  mocks.eq.mockReturnValue(
    builder,
  )

  mocks.maybeSingle.mockReturnValue(
    builder,
  )

  mocks.deleteQuery.mockReturnValue(
    builder,
  )

  mocks.insert.mockResolvedValue({
    data: null,
    error: null,
  })
})

describe(
  'hasLiked',
  () => {
    it(
      'returns true when the caller has a like row',
      async () => {
        mocks.result.mockResolvedValueOnce({
          id: 'like-1',
        })

        await expect(
          hasLiked(
            'a1',
            'alice',
          ),
        ).resolves.toBe(true)

        expect(
          mocks.from,
        ).toHaveBeenCalledWith(
          'likes',
        )

        expect(
          mocks.select,
        ).toHaveBeenCalledWith(
          'id',
        )

        expect(
          mocks.eq,
        ).toHaveBeenNthCalledWith(
          1,
          'artwork_id',
          'a1',
        )

        expect(
          mocks.eq,
        ).toHaveBeenNthCalledWith(
          2,
          'user_id',
          'alice',
        )

        expect(
          mocks.maybeSingle,
        ).toHaveBeenCalledTimes(
          1,
        )
      },
    )

    it(
      'returns false when no like row exists',
      async () => {
        mocks.result.mockResolvedValueOnce(
          null,
        )

        await expect(
          hasLiked(
            'a1',
            'alice',
          ),
        ).resolves.toBe(false)
      },
    )

    it(
      'propagates the typed error returned by the Supabase data layer',
      async () => {
        mocks.result.mockRejectedValueOnce({
          code:
            'permission-denied',

          message:
            'You do not have permission to do that.',
        })

        await expect(
          hasLiked(
            'a1',
            'alice',
          ),
        ).rejects.toEqual({
          code:
            'permission-denied',

          message:
            'You do not have permission to do that.',
        })
      },
    )
  },
)

describe(
  'likeArtwork',
  () => {
    it(
      'inserts one like row for the artwork and user',
      async () => {
        mocks.insert.mockResolvedValueOnce({
          data: null,
          error: null,
        })

        await expect(
          likeArtwork(
            'a1',
            'alice',
          ),
        ).resolves.toBeUndefined()

        expect(
          mocks.from,
        ).toHaveBeenCalledWith(
          'likes',
        )

        expect(
          mocks.insert,
        ).toHaveBeenCalledWith({
          artwork_id:
            'a1',

          user_id:
            'alice',
        })
      },
    )

    it(
      'treats PostgreSQL unique violation as an idempotent already-liked operation',
      async () => {
        mocks.insert.mockResolvedValueOnce({
          data: null,

          error: {
            code:
              '23505',

            message:
              'duplicate key',
          },
        })

        await expect(
          likeArtwork(
            'a1',
            'alice',
          ),
        ).resolves.toBeUndefined()
      },
    )

    it(
      'maps a Supabase permission error to the shared typed error',
      async () => {
        mocks.insert.mockResolvedValueOnce({
          data: null,

          error: {
            code:
              '42501',

            message:
              'permission denied',
          },
        })

        await expect(
          likeArtwork(
            'a1',
            'alice',
          ),
        ).rejects.toEqual({
          code:
            'permission-denied',

          message:
            'You do not have permission to do that.',
        })
      },
    )
  },
)

describe(
  'unlikeArtwork',
  () => {
    it(
      'deletes only the matching artwork/user like row',
      async () => {
        mocks.result.mockResolvedValueOnce(
          [],
        )

        await expect(
          unlikeArtwork(
            'a1',
            'alice',
          ),
        ).resolves.toBeUndefined()

        expect(
          mocks.from,
        ).toHaveBeenCalledWith(
          'likes',
        )

        expect(
          mocks.deleteQuery,
        ).toHaveBeenCalledTimes(
          1,
        )

        expect(
          mocks.eq,
        ).toHaveBeenNthCalledWith(
          1,
          'artwork_id',
          'a1',
        )

        expect(
          mocks.eq,
        ).toHaveBeenNthCalledWith(
          2,
          'user_id',
          'alice',
        )
      },
    )

    it(
      'propagates a typed network failure from the Supabase data layer',
      async () => {
        mocks.result.mockRejectedValueOnce({
          code:
            'network',

          message:
            'Network unavailable. Check your connection and try again.',
        })

        await expect(
          unlikeArtwork(
            'a1',
            'alice',
          ),
        ).rejects.toEqual({
          code:
            'network',

          message:
            'Network unavailable. Check your connection and try again.',
        })
      },
    )
  },
)

describe(
  'getAuthoritativeLikeState',
  () => {
    it(
      'returns liked true together with the authoritative RPC like count',
      async () => {
        mocks.result.mockResolvedValueOnce({
          id:
            'like-1',
        })

        mocks.rpc.mockResolvedValueOnce(
          7,
        )

        await expect(
          getAuthoritativeLikeState(
            'a1',
            'alice',
          ),
        ).resolves.toEqual({
          liked:
            true,

          likeCount:
            7,
        })

        expect(
          mocks.rpc,
        ).toHaveBeenCalledWith(
          'artwork_like_count',
          {
            target:
              'a1',
          },
        )
      },
    )

    it(
      'returns liked false when no personal like row exists',
      async () => {
        mocks.result.mockResolvedValueOnce(
          null,
        )

        mocks.rpc.mockResolvedValueOnce(
          3,
        )

        await expect(
          getAuthoritativeLikeState(
            'a1',
            'alice',
          ),
        ).resolves.toEqual({
          liked:
            false,

          likeCount:
            3,
        })
      },
    )

    it(
      'defensively converts malformed or negative RPC counts to zero',
      async () => {
        mocks.result.mockResolvedValueOnce(
          null,
        )

        mocks.rpc.mockResolvedValueOnce(
          -5,
        )

        await expect(
          getAuthoritativeLikeState(
            'a1',
            'alice',
          ),
        ).resolves.toEqual({
          liked:
            false,

          likeCount:
            0,
        })

        mocks.result.mockResolvedValueOnce(
          null,
        )

        mocks.rpc.mockResolvedValueOnce(
          'invalid',
        )

        await expect(
          getAuthoritativeLikeState(
            'a1',
            'alice',
          ),
        ).resolves.toEqual({
          liked:
            false,

          likeCount:
            0,
        })
      },
    )

    it(
      'propagates a typed failure when the authoritative count RPC fails',
      async () => {
        mocks.result.mockResolvedValueOnce(
          null,
        )

        mocks.rpc.mockRejectedValueOnce({
          code:
            'network',

          message:
            'Network unavailable. Check your connection and try again.',
        })

        await expect(
          getAuthoritativeLikeState(
            'a1',
            'alice',
          ),
        ).rejects.toEqual({
          code:
            'network',

          message:
            'Network unavailable. Check your connection and try again.',
        })
      },
    )
  },
)

describe(
  'toLikeError',
  () => {
    it(
      'maps PostgreSQL permission-denied errors',
      () => {
        expect(
          toLikeError({
            code:
              '42501',
          }),
        ).toEqual({
          code:
            'permission-denied',

          message:
            'You do not have permission to do that.',
        })
      },
    )

    it(
      'maps PostgreSQL/network failures',
      () => {
        expect(
          toLikeError({
            code:
              '57014',
          }),
        ).toEqual({
          code:
            'network',

          message:
            'Network unavailable. Check your connection and try again.',
        })
      },
    )

    it(
      'falls back to unknown for an unrecognized error',
      () => {
        expect(
          toLikeError(
            new Error(
              'boom',
            ),
          ),
        ).toEqual({
          code:
            'unknown',

          message:
            'Something went wrong. Please try again.',
        })
      },
    )
  },
)