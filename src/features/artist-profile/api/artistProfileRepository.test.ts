import { describe, expect, it, vi } from 'vitest'

const { doc, getDoc, onSnapshot, updateDoc, serverTimestamp } = vi.hoisted(() => ({
  doc: vi.fn(() => ({ path: 'artists/alice' })),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}))

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return { ...actual, doc, getDoc, onSnapshot, updateDoc, serverTimestamp }
})
vi.mock('@/lib/firebase/config', () => ({ db: {} }))

const { getArtistDisplayName, subscribeArtistProfile, toArtistProfileError, updateArtistProfile } = await import(
  './artistProfileRepository'
)

describe('subscribeArtistProfile', () => {
  it('subscribes exactly once and returns the underlying unsubscribe function', () => {
    const unsubscribe = vi.fn()
    onSnapshot.mockReturnValueOnce(unsubscribe)
    const result = subscribeArtistProfile('alice', vi.fn(), vi.fn())
    expect(onSnapshot).toHaveBeenCalledTimes(1)
    expect(result).toBe(unsubscribe)
  })

  it('maps a real document to an ArtistProfile', () => {
    const onData = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, successCallback: (snap: unknown) => void) => {
      successCallback({
        id: 'alice',
        exists: () => true,
        data: () => ({ displayName: 'Alice Fine Art', bio: 'Oil paintings.', createdAt: 1, updatedAt: 1 }),
      })
      return vi.fn()
    })
    subscribeArtistProfile('alice', onData, vi.fn())
    expect(onData).toHaveBeenCalledWith(expect.objectContaining({ uid: 'alice', displayName: 'Alice Fine Art' }))
  })

  it('reports null when the artist profile does not exist', () => {
    const onData = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, successCallback: (snap: unknown) => void) => {
      successCallback({ exists: () => false })
      return vi.fn()
    })
    subscribeArtistProfile('alice', onData, vi.fn())
    expect(onData).toHaveBeenCalledWith(null)
  })

  it('treats a document with a missing displayName/bio as unreadable rather than crashing', () => {
    const onData = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, successCallback: (snap: unknown) => void) => {
      successCallback({ id: 'alice', exists: () => true, data: () => ({}) })
      return vi.fn()
    })
    subscribeArtistProfile('alice', onData, vi.fn())
    expect(onData).toHaveBeenCalledWith(null)
  })

  it('maps a listener error via toArtistProfileError', () => {
    const onError = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, _onData, errorCallback: (error: unknown) => void) => {
      errorCallback({ code: 'permission-denied' })
      return vi.fn()
    })
    subscribeArtistProfile('alice', vi.fn(), onError)
    expect(onError).toHaveBeenCalledWith({ code: 'permission-denied', message: 'You do not have permission to do that.' })
  })
})

describe('updateArtistProfile', () => {
  it('writes only displayName, bio, and a fresh updatedAt', async () => {
    updateDoc.mockResolvedValueOnce(undefined)

    await updateArtistProfile('alice', { displayName: '  Alice Fine Art Studio  ', bio: '  An updated bio.  ' })

    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), {
      displayName: 'Alice Fine Art Studio',
      bio: 'An updated bio.',
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })

  it('throws a typed error when the write is denied', async () => {
    updateDoc.mockRejectedValueOnce({ code: 'permission-denied' })
    await expect(updateArtistProfile('alice', { displayName: 'x', bio: 'y' })).rejects.toEqual({
      code: 'permission-denied',
      message: 'You do not have permission to do that.',
    })
  })
})

describe('getArtistDisplayName', () => {
  it('returns the display name for an existing profile', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ displayName: 'Alice Fine Art' }) })
    await expect(getArtistDisplayName('alice')).resolves.toBe('Alice Fine Art')
  })

  it('returns null for a nonexistent profile', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => false })
    await expect(getArtistDisplayName('nobody')).resolves.toBeNull()
  })

  it('returns null for a malformed document rather than throwing', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({}) })
    await expect(getArtistDisplayName('alice')).resolves.toBeNull()
  })

  it('returns null (never throws) when the read itself fails', async () => {
    getDoc.mockRejectedValueOnce({ code: 'unavailable' })
    await expect(getArtistDisplayName('alice')).resolves.toBeNull()
  })
})

describe('toArtistProfileError', () => {
  it('maps unavailable to a network error', () => {
    expect(toArtistProfileError({ code: 'unavailable' })).toEqual({
      code: 'network',
      message: 'Network unavailable. Check your connection and try again.',
    })
  })

  it('falls back to unknown for an unrecognized error', () => {
    expect(toArtistProfileError(new Error('boom'))).toEqual({ code: 'unknown', message: 'Something went wrong. Please try again.' })
  })
})
