import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const mocks = vi.hoisted(() => {
  const state = {
    response: {
      data: null as unknown,
      error: null as unknown,
    },
  }

  const builder: Record<
    string,
    unknown
  > = {}

  const select = vi.fn(
    () => builder,
  )

  const eq = vi.fn(
    () => builder,
  )

  const insert = vi.fn(
    () => builder,
  )

  const deleteQuery = vi.fn(
    () => builder,
  )

  Object.assign(
    builder,
    {
      select,
      eq,
      insert,
      delete: deleteQuery,

      then: (
        resolve: (
          value: {
            data: unknown
            error: unknown
          },
        ) => unknown,
        reject?: (
          error: unknown,
        ) => unknown,
      ) =>
        Promise.resolve(
          state.response,
        ).then(
          resolve,
          reject,
        ),
    },
  )

  const from = vi.fn(
    () => builder,
  )

  const createClient =
    vi.fn(() => ({
      from,
    }))

  const result = vi.fn()

  const observe = vi.fn()

  return {
    state,

    builder,

    select,
    eq,
    insert,
    deleteQuery,

    from,
    createClient,

    result,
    observe,
  }
})

vi.mock(
  '@/lib/supabase/client',
  () => ({
    createClient:
      mocks.createClient,
  }),
)

vi.mock(
  '@/lib/supabase/data',
  async (
    importOriginal,
  ) => {
    const actual =
      await importOriginal<
        typeof import('@/lib/supabase/data')
      >()

    return {
      ...actual,

      result:
        mocks.result,

      observe:
        mocks.observe,
    }
  },
)

const {
  addWishlistItem,
  removeWishlistItem,
  subscribeWishlistIds,
  toWishlistError,
} = await import(
  './wishlistRepository'
)

beforeEach(() => {
  mocks.select.mockClear()
  mocks.eq.mockClear()
  mocks.insert.mockClear()
  mocks.deleteQuery.mockClear()
  mocks.from.mockClear()
  mocks.createClient.mockClear()

  mocks.result.mockReset()
  mocks.observe.mockReset()

  mocks.state.response = {
    data: null,
    error: null,
  }
})

describe(
  'addWishlistItem',
  () => {
    it('inserts the user and artwork ids into Supabase', async () => {
      mocks.state.response = {
        data: null,
        error: null,
      }

      await addWishlistItem(
        'alice',
        'a1',
      )

      expect(
        mocks.from,
      ).toHaveBeenCalledWith(
        'wishlist_items',
      )

      expect(
        mocks.insert,
      ).toHaveBeenCalledWith({
        user_id: 'alice',
        artwork_id: 'a1',
      })
    })

    it('ignores duplicate-row errors', async () => {
      mocks.state.response = {
        data: null,

        error: {
          code: '23505',
        },
      }

      await expect(
        addWishlistItem(
          'alice',
          'a1',
        ),
      ).resolves.toBeUndefined()
    })

    it('maps Supabase permission errors', async () => {
      mocks.state.response = {
        data: null,

        error: {
          code: '42501',
        },
      }

      await expect(
        addWishlistItem(
          'alice',
          'a1',
        ),
      ).rejects.toEqual({
        code:
          'permission-denied',

        message:
          'You do not have permission to do that.',
      })
    })
  },
)

describe(
  'removeWishlistItem',
  () => {
    it('deletes the matching Supabase row', async () => {
      mocks.result.mockResolvedValueOnce(
        null,
      )

      await removeWishlistItem(
        'alice',
        'a1',
      )

      expect(
        mocks.deleteQuery,
      ).toHaveBeenCalledTimes(
        1,
      )

      expect(
        mocks.eq,
      ).toHaveBeenCalledWith(
        'user_id',
        'alice',
      )

      expect(
        mocks.eq,
      ).toHaveBeenCalledWith(
        'artwork_id',
        'a1',
      )
    })

    it('propagates a typed delete error', async () => {
      mocks.result.mockRejectedValueOnce({
        code:
          'permission-denied',

        message:
          'You do not have permission to do that.',
      })

      await expect(
        removeWishlistItem(
          'alice',
          'a1',
        ),
      ).rejects.toEqual({
        code:
          'permission-denied',

        message:
          'You do not have permission to do that.',
      })
    })
  },
)

describe(
  'subscribeWishlistIds',
  () => {
    it('uses Supabase Realtime observation and maps artwork ids into a Set', async () => {
      const unsubscribe =
        vi.fn()

      mocks.result.mockResolvedValueOnce([
        {
          artwork_id: 'a1',
        },
        {
          artwork_id: 'a2',
        },
      ])

      mocks.observe.mockImplementationOnce(
        (
          _table: string,
          _filter:
            | string
            | undefined,
          read: () => Promise<
            Set<string>
          >,
          onData: (
            value: Set<string>,
          ) => void,
          onError: (
            error: unknown,
          ) => void,
        ) => {
          void read().then(
            onData,
            onError,
          )

          return unsubscribe
        },
      )

      const onData =
        vi.fn()

      const returned =
        subscribeWishlistIds(
          'alice',
          onData,
          vi.fn(),
        )

      expect(
        returned,
      ).toBe(
        unsubscribe,
      )

      expect(
        mocks.observe,
      ).toHaveBeenCalledWith(
        'wishlist_items',
        'user_id=eq.alice',
        expect.any(Function),
        onData,
        expect.any(Function),
      )

      await vi.waitFor(
        () => {
          expect(
            onData,
          ).toHaveBeenCalledWith(
            new Set([
              'a1',
              'a2',
            ]),
          )
        },
      )
    })

    it('returns an empty Set when the wishlist is empty', async () => {
      mocks.result.mockResolvedValueOnce(
        [],
      )

      mocks.observe.mockImplementationOnce(
        (
          _table: string,
          _filter:
            | string
            | undefined,
          read: () => Promise<
            Set<string>
          >,
          onData: (
            value: Set<string>,
          ) => void,
          onError: (
            error: unknown,
          ) => void,
        ) => {
          void read().then(
            onData,
            onError,
          )

          return vi.fn()
        },
      )

      const onData =
        vi.fn()

      subscribeWishlistIds(
        'alice',
        onData,
        vi.fn(),
      )

      await vi.waitFor(
        () => {
          expect(
            onData,
          ).toHaveBeenCalledWith(
            new Set(),
          )
        },
      )
    })

    it('passes subscription errors to the provided error callback', () => {
      const onError =
        vi.fn()

      const error = {
        code: 'network',
        message:
          'Network unavailable. Check your connection and try again.',
      }

      mocks.observe.mockImplementationOnce(
        (
          _table: string,
          _filter:
            | string
            | undefined,
          _read: () => Promise<
            Set<string>
          >,
          _onData: (
            value: Set<string>,
          ) => void,
          errorCallback: (
            error: unknown,
          ) => void,
        ) => {
          errorCallback(
            error,
          )

          return vi.fn()
        },
      )

      subscribeWishlistIds(
        'alice',
        vi.fn(),
        onError,
      )

      expect(
        onError,
      ).toHaveBeenCalledWith(
        error,
      )
    })

    it('returns the unsubscribe function supplied by the Supabase observer', () => {
      const unsubscribe =
        vi.fn()

      mocks.observe.mockReturnValueOnce(
        unsubscribe,
      )

      const result =
        subscribeWishlistIds(
          'alice',
          vi.fn(),
          vi.fn(),
        )

      expect(
        result,
      ).toBe(
        unsubscribe,
      )
    })
  },
)

describe(
  'toWishlistError',
  () => {
    it('maps a Supabase RLS denial', () => {
      expect(
        toWishlistError({
          code: '42501',
        }),
      ).toEqual({
        code:
          'permission-denied',

        message:
          'You do not have permission to do that.',
      })
    })

    it('maps network failures', () => {
      expect(
        toWishlistError(
          new TypeError(
            'offline',
          ),
        ),
      ).toEqual({
        code: 'network',

        message:
          'Network unavailable. Check your connection and try again.',
      })
    })

    it('falls back to unknown for an unrecognized error', () => {
      expect(
        toWishlistError(
          new Error(
            'boom',
          ),
        ),
      ).toEqual({
        code: 'unknown',

        message:
          'Something went wrong. Please try again.',
      })
    })
  },
)