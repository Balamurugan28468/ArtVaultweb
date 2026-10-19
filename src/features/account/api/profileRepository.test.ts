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
  const update = vi.fn()

  const builder = {
    select,
    eq,
    update,
    maybeSingle,
  }

  select.mockReturnValue(builder)
  eq.mockReturnValue(builder)
  update.mockReturnValue(builder)

  const getUser = vi.fn()

  const realtimeChannel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  }

  realtimeChannel.on.mockReturnValue(realtimeChannel)
  realtimeChannel.subscribe.mockReturnValue(realtimeChannel)

  const from = vi.fn(() => builder)
  const channel = vi.fn(() => realtimeChannel)
  const removeChannel = vi.fn()

  const supabase = {
    auth: {
      getUser,
    },
    from,
    channel,
    removeChannel,
  }

  const getCurrentRoleClaim = vi.fn()

  return {
    builder,
    maybeSingle,
    select,
    eq,
    update,
    getUser,
    from,
    channel,
    removeChannel,
    realtimeChannel,
    supabase,
    getCurrentRoleClaim,
  }
})

vi.mock(
  '@/lib/supabase/client',
  () => ({
    createClient: () => mocks.supabase,
  }),
)

vi.mock(
  '@/features/auth/api/roleClaim',
  () => ({
    getCurrentRoleClaim:
      mocks.getCurrentRoleClaim,
  }),
)

const {
  getUserProfile,
  subscribeUserProfile,
  toAccountError,
  updateUserProfile,
} = await import('./profileRepository')

beforeEach(() => {
  mocks.maybeSingle.mockReset()

  mocks.select.mockClear()
  mocks.eq.mockClear()
  mocks.update.mockClear()

  mocks.getUser.mockReset()
  mocks.from.mockClear()

  mocks.channel.mockClear()
  mocks.removeChannel.mockReset()

  mocks.realtimeChannel.on.mockClear()
  mocks.realtimeChannel.subscribe.mockClear()

  mocks.getCurrentRoleClaim.mockReset()

  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: 'alice',
        email: 'alice@example.com',
        user_metadata: {
          avatar_url:
            'https://example.com/a.png',
        },
      },
    },
    error: null,
  })

  mocks.getCurrentRoleClaim.mockResolvedValue(
    'CUSTOMER',
  )

  mocks.maybeSingle.mockResolvedValue({
    data: null,
    error: null,
  })

  mocks.removeChannel.mockResolvedValue(
    undefined,
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('getUserProfile', () => {
  it('maps a Supabase profile row and authenticated user to UserProfile', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'alice',
        display_name: 'Alice',
        phone: '+1 555 0100',
        bio: 'Hi',
        photo_path:
          'alice/profile/avatar.png',
        profile_completed: true,
        created_at:
          '2026-09-01T10:00:00.000Z',
        updated_at:
          '2026-09-02T11:30:00.000Z',
      },
      error: null,
    })

    await expect(
      getUserProfile('alice'),
    ).resolves.toEqual({
      id: 'alice',
      uid: 'alice',
      email: 'alice@example.com',
      displayName: 'Alice',
      phoneNumber: '+1 555 0100',
      bio: 'Hi',
      photoPath:
        'alice/profile/avatar.png',
      photoURL:
        'https://example.com/a.png',
      role: 'CUSTOMER',
      profileCompleted: true,
      createdAt:
        '2026-09-01T10:00:00.000Z',
      updatedAt:
        '2026-09-02T11:30:00.000Z',
    })

    expect(
      mocks.from,
    ).toHaveBeenCalledWith(
      'profiles',
    )

    expect(
      mocks.eq,
    ).toHaveBeenCalledWith(
      'id',
      'alice',
    )
  })

  it('returns null when the Supabase profile row does not exist', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    })

    await expect(
      getUserProfile('alice'),
    ).resolves.toBeNull()
  })

  it('defensively defaults nullable profile fields', async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'alice',
          email: 'alice@example.com',
          user_metadata: {},
        },
      },
      error: null,
    })

    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'alice',
        display_name: null,
        phone: null,
        bio: null,
        photo_path: null,
        profile_completed: false,
        created_at:
          '2026-09-01T10:00:00.000Z',
        updated_at:
          '2026-09-01T10:00:00.000Z',
      },
      error: null,
    })

    const profile =
      await getUserProfile('alice')

    expect(profile).toMatchObject({
      id: 'alice',
      uid: 'alice',
      displayName: null,
      phoneNumber: null,
      bio: null,
      photoPath: null,
      photoURL: null,
      profileCompleted: false,
    })
  })

  it('falls back to CUSTOMER when no authoritative role claim is available', async () => {
    mocks.getCurrentRoleClaim.mockResolvedValueOnce(
      null,
    )

    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'alice',
        display_name: 'Alice',
        phone: null,
        bio: null,
        photo_path: null,
        profile_completed: false,
        created_at:
          '2026-09-01T10:00:00.000Z',
        updated_at:
          '2026-09-01T10:00:00.000Z',
      },
      error: null,
    })

    const profile =
      await getUserProfile('alice')

    expect(profile?.role).toBe(
      'CUSTOMER',
    )
  })

  it('rejects access when the authenticated user does not match the requested profile', async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: {
        user: {
          id: 'mallory',
          email: 'mallory@example.com',
          user_metadata: {},
        },
      },
      error: null,
    })

    await expect(
      getUserProfile('alice'),
    ).rejects.toEqual({
      code: 'permission-denied',
      message:
        'You do not have permission to do that.',
    })

    expect(
      mocks.from,
    ).not.toHaveBeenCalled()
  })
})

describe('updateUserProfile', () => {
  it('writes only the allowed Supabase profile fields with deterministic profileCompleted', async () => {
    vi.useFakeTimers()

    vi.setSystemTime(
      new Date(
        '2026-09-20T06:30:00.000Z',
      ),
    )

    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'alice',
      },
      error: null,
    })

    await updateUserProfile(
      'alice',
      {
        displayName:
          '  Alice Updated  ',
        phoneNumber:
          '  +1 555 0100  ',
        bio: '  Hi  ',
      },
    )

    expect(
      mocks.update,
    ).toHaveBeenCalledWith({
      display_name:
        'Alice Updated',
      phone:
        '+1 555 0100',
      bio: 'Hi',
      profile_completed: true,
      updated_at:
        '2026-09-20T06:30:00.000Z',
    })

    expect(
      mocks.eq,
    ).toHaveBeenCalledWith(
      'id',
      'alice',
    )

    expect(
      mocks.select,
    ).toHaveBeenCalledWith(
      'id',
    )
  })

  it('computes profileCompleted as false when bio or phone is missing', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'alice',
      },
      error: null,
    })

    await updateUserProfile(
      'alice',
      {
        displayName: 'Alice',
        phoneNumber: null,
        bio: null,
      },
    )

    expect(
      mocks.update,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        display_name: 'Alice',
        phone: null,
        bio: null,
        profile_completed: false,
      }),
    )
  })

  it('throws a typed AccountError when Supabase denies the write', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: {
        code: '42501',
        message: 'permission denied',
      },
    })

    await expect(
      updateUserProfile(
        'alice',
        {
          displayName: 'Alice',
          phoneNumber: null,
          bio: null,
        },
      ),
    ).rejects.toEqual({
      code: 'permission-denied',
      message:
        'You do not have permission to do that.',
    })
  })

  it('returns a typed not-found error when no profile row was updated', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    })

    await expect(
      updateUserProfile(
        'alice',
        {
          displayName: 'Alice',
          phoneNumber: null,
          bio: null,
        },
      ),
    ).rejects.toEqual({
      code: 'not-found',
      message: 'Profile not found.',
    })
  })
})

describe('toAccountError', () => {
  it('maps unavailable to a network error', () => {
    expect(
      toAccountError({
        code: 'unavailable',
      }),
    ).toEqual({
      code: 'network',
      message:
        'Network unavailable. Check your connection and try again.',
    })
  })

  it('maps Supabase permission errors', () => {
    expect(
      toAccountError({
        code: '42501',
      }),
    ).toEqual({
      code: 'permission-denied',
      message:
        'You do not have permission to do that.',
    })
  })

  it('falls back to unknown for an unrecognized error', () => {
    expect(
      toAccountError(
        new Error('boom'),
      ),
    ).toEqual({
      code: 'unknown',
      message:
        'Something went wrong. Please try again.',
    })
  })
})

describe('subscribeUserProfile', () => {
  it('subscribes to the Supabase profiles table and removes the channel on cleanup', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: 'alice',
        display_name: 'Alice',
        phone: null,
        bio: null,
        photo_path: null,
        profile_completed: false,
        created_at:
          '2026-09-01T10:00:00.000Z',
        updated_at:
          '2026-09-01T10:00:00.000Z',
      },
      error: null,
    })

    const onData = vi.fn()
    const onError = vi.fn()

    const unsubscribe =
      subscribeUserProfile(
        'alice',
        onData,
        onError,
      )

    expect(
      mocks.channel,
    ).toHaveBeenCalledWith(
      'profile:alice',
    )

    expect(
      mocks.realtimeChannel.on,
    ).toHaveBeenCalledWith(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'profiles',
        filter: 'id=eq.alice',
      },
      expect.any(Function),
    )

    expect(
      mocks.realtimeChannel.subscribe,
    ).toHaveBeenCalledWith(
      expect.any(Function),
    )

    await vi.waitFor(() => {
      expect(
        onData,
      ).toHaveBeenCalled()
    })

    expect(
      onError,
    ).not.toHaveBeenCalled()

    unsubscribe()

    expect(
      mocks.removeChannel,
    ).toHaveBeenCalledWith(
      mocks.realtimeChannel,
    )
  })
})