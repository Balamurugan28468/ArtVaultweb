import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const select = vi.fn()
  const eq = vi.fn()

  const insert = vi.fn()
  const update = vi.fn()
  const upsert = vi.fn()

  const builder = {
    select,
    eq,
    maybeSingle,
    insert,
    update,
    upsert,
  }

  select.mockReturnValue(builder)
  eq.mockReturnValue(builder)

  const from = vi.fn(
    () => builder,
  )

  const supabase = {
    from,
  }

  return {
    maybeSingle,
    select,
    eq,
    insert,
    update,
    upsert,
    from,
    supabase,
  }
})

vi.mock(
  '@/lib/supabase/client',
  () => ({
    createClient: () =>
      mocks.supabase,
  }),
)

const {
  ensureUserProfile,
} = await import(
  './ensureUserProfile'
)

beforeEach(() => {
  mocks.maybeSingle.mockReset()

  mocks.select.mockClear()
  mocks.eq.mockClear()

  mocks.insert.mockClear()
  mocks.update.mockClear()
  mocks.upsert.mockClear()

  mocks.from.mockClear()

  mocks.maybeSingle.mockResolvedValue({
    data: {
      id: 'alice',
    },
    error: null,
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe(
  'ensureUserProfile',
  () => {
    it('returns immediately when the server-provisioned Supabase profile already exists', async () => {
      await expect(
        ensureUserProfile({
          id: 'alice',
        }),
      ).resolves.toBeUndefined()

      expect(
        mocks.from,
      ).toHaveBeenCalledWith(
        'profiles',
      )

      expect(
        mocks.select,
      ).toHaveBeenCalledWith(
        'id',
      )

      expect(
        mocks.eq,
      ).toHaveBeenCalledWith(
        'id',
        'alice',
      )

      expect(
        mocks.maybeSingle,
      ).toHaveBeenCalledTimes(1)
    })

    it('supports the uid compatibility alias during the migration', async () => {
      await expect(
        ensureUserProfile({
          uid: 'alice',
        }),
      ).resolves.toBeUndefined()

      expect(
        mocks.eq,
      ).toHaveBeenCalledWith(
        'id',
        'alice',
      )
    })

    it('never performs a client-side profile write regardless of the requested role', async () => {
      await ensureUserProfile(
        {
          id: 'alice',
        },
        {
          role: 'CUSTOMER',
          displayName: 'Alice',
        },
      )

      expect(
        mocks.insert,
      ).not.toHaveBeenCalled()

      expect(
        mocks.update,
      ).not.toHaveBeenCalled()

      expect(
        mocks.upsert,
      ).not.toHaveBeenCalled()
    })

    it('does not use a caller-provided SELLER role to mutate authority state', async () => {
      await ensureUserProfile(
        {
          id: 'alice',
        },
        {
          role: 'SELLER',
          displayName: 'Alice',
        },
      )

      expect(
        mocks.insert,
      ).not.toHaveBeenCalled()

      expect(
        mocks.update,
      ).not.toHaveBeenCalled()

      expect(
        mocks.upsert,
      ).not.toHaveBeenCalled()
    })

    it('polls until server-side profile provisioning becomes visible', async () => {
      vi.useFakeTimers()

      mocks.maybeSingle
        .mockResolvedValueOnce({
          data: null,
          error: null,
        })
        .mockResolvedValueOnce({
          data: {
            id: 'alice',
          },
          error: null,
        })

      const promise =
        ensureUserProfile({
          id: 'alice',
        })

      await vi.runAllTimersAsync()

      await expect(
        promise,
      ).resolves.toBeUndefined()

      expect(
        mocks.maybeSingle,
      ).toHaveBeenCalledTimes(2)
    })

    it('propagates a Supabase profile-read failure immediately', async () => {
      const error = {
        code: '42501',
        message:
          'permission denied',
      }

      mocks.maybeSingle.mockResolvedValueOnce({
        data: null,
        error,
      })

      await expect(
        ensureUserProfile({
          id: 'alice',
        }),
      ).rejects.toEqual(
        error,
      )

      expect(
        mocks.maybeSingle,
      ).toHaveBeenCalledTimes(1)
    })

    it('throws when the authenticated identity has no usable id', async () => {
      await expect(
        ensureUserProfile({}),
      ).rejects.toThrow(
        'Authenticated user ID is missing.',
      )

      expect(
        mocks.from,
      ).not.toHaveBeenCalled()
    })

    it('fails clearly when server-side provisioning never produces the profile', async () => {
      vi.useFakeTimers()

      mocks.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      })

      const promise =
        ensureUserProfile({
          id: 'alice',
        })

      const expectation =
        expect(
          promise,
        ).rejects.toThrow(
          'Your Supabase account exists, but its profile was not provisioned.',
        )

      await vi.runAllTimersAsync()

      await expectation

      expect(
        mocks.maybeSingle,
      ).toHaveBeenCalledTimes(11)
    })
  },
)