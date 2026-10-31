import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  observe: vi.fn(),
  requireIdentity: vi.fn(),
  result: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/data')>()),
  observe: mocks.observe,
  requireIdentity: mocks.requireIdentity,
  result: mocks.result,
}))

const { getArtistDisplayName, subscribeArtistProfile, toArtistProfileError, updateArtistProfile } = await import(
  './artistProfileRepository'
)

function installClient() {
  const builder = {
    select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), update: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.maybeSingle.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  const from = vi.fn(() => builder)
  mocks.createClient.mockReturnValue({ from })
  return { builder, from }
}

const profileRow = {
  id: 'alice', display_name: 'Alice Fine Art', bio: 'Oil paintings.',
  created_at: '2026-09-19T10:00:00.000Z', updated_at: '2026-09-19T10:00:00.000Z',
}

beforeEach(() => {
  mocks.createClient.mockReset()
  mocks.observe.mockReset()
  mocks.requireIdentity.mockReset()
  mocks.result.mockReset()
  mocks.requireIdentity.mockResolvedValue(undefined)
})

describe('subscribeArtistProfile', () => {
  it('subscribes through Supabase Realtime and returns its cleanup function', () => {
    const unsubscribe = vi.fn()
    mocks.observe.mockReturnValueOnce(unsubscribe)
    const result = subscribeArtistProfile('alice', vi.fn(), vi.fn())
    expect(mocks.observe).toHaveBeenCalledWith('artist_profiles', 'id=eq.alice', expect.any(Function), expect.any(Function), expect.any(Function))
    expect(result).toBe(unsubscribe)
  })

  it('re-reads and maps the public profile through RLS after a realtime event', async () => {
    installClient()
    mocks.result.mockResolvedValueOnce(profileRow)
    let read: (() => Promise<unknown>) | undefined
    mocks.observe.mockImplementation((_table, _filter, readFunction) => { read = readFunction; return vi.fn() })

    subscribeArtistProfile('alice', vi.fn(), vi.fn())
    await expect(read?.()).resolves.toEqual(expect.objectContaining({ uid: 'alice', displayName: 'Alice Fine Art' }))
  })

  it('returns null for a missing or malformed Supabase profile row', async () => {
    installClient()
    let read: (() => Promise<unknown>) | undefined
    mocks.observe.mockImplementation((_table, _filter, readFunction) => { read = readFunction; return vi.fn() })
    subscribeArtistProfile('alice', vi.fn(), vi.fn())
    mocks.result.mockResolvedValueOnce(null)
    await expect(read?.()).resolves.toBeNull()
    mocks.result.mockResolvedValueOnce({ id: 'alice', display_name: 1 })
    await expect(read?.()).resolves.toBeNull()
  })
})

describe('updateArtistProfile', () => {
  it('writes only editable public fields through the owner-scoped Supabase update', async () => {
    const { builder, from } = installClient()
    mocks.result.mockResolvedValueOnce([{ id: 'alice' }])

    await updateArtistProfile('alice', { displayName: '  Alice Fine Art Studio  ', bio: '  An updated bio.  ' })

    expect(mocks.requireIdentity).toHaveBeenCalledWith('alice')
    expect(from).toHaveBeenCalledWith('artist_profiles')
    expect(builder.update).toHaveBeenCalledWith({ display_name: 'Alice Fine Art Studio', bio: 'An updated bio.' })
  })

  it('throws a typed error when the write is denied', async () => {
    installClient()
    mocks.result.mockRejectedValueOnce({ code: '42501' })
    await expect(updateArtistProfile('alice', { displayName: 'x', bio: 'y' })).rejects.toEqual({
      code: 'permission-denied',
      message: 'You do not have permission to do that.',
    })
  })
})

describe('getArtistDisplayName', () => {
  it('returns the display name for an existing profile', async () => {
    installClient()
    mocks.result.mockResolvedValueOnce({ display_name: 'Alice Fine Art' })
    await expect(getArtistDisplayName('alice')).resolves.toBe('Alice Fine Art')
  })

  it('returns null for a nonexistent profile', async () => {
    installClient()
    mocks.result.mockResolvedValueOnce(null)
    await expect(getArtistDisplayName('nobody')).resolves.toBeNull()
  })

  it('returns null for a malformed document rather than throwing', async () => {
    installClient()
    mocks.result.mockResolvedValueOnce({})
    await expect(getArtistDisplayName('alice')).resolves.toBeNull()
  })

  it('returns null (never throws) when the read itself fails', async () => {
    installClient()
    mocks.result.mockRejectedValueOnce(new TypeError('offline'))
    await expect(getArtistDisplayName('alice')).resolves.toBeNull()
  })
})

describe('toArtistProfileError', () => {
  it('maps a network failure to a network error', () => {
    expect(toArtistProfileError(new TypeError('offline'))).toEqual({
      code: 'network',
      message: 'Network unavailable. Check your connection and try again.',
    })
  })

  it('falls back to unknown for an unrecognized error', () => {
    expect(toArtistProfileError(new Error('boom'))).toEqual({ code: 'unknown', message: 'Something went wrong. Please try again.' })
  })
})
