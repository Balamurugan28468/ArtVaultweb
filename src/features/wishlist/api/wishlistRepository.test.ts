import { describe, expect, it, vi } from 'vitest'

const { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } = vi.hoisted(() => ({
  collection: vi.fn(() => ({ path: 'wishlists/alice/items' })),
  deleteDoc: vi.fn(),
  doc: vi.fn(() => ({ path: 'wishlists/alice/items/a1' })),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  setDoc: vi.fn(),
}))

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return { ...actual, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc }
})
vi.mock('@/lib/firebase/config', () => ({ db: {} }))

const { addWishlistItem, removeWishlistItem, subscribeWishlistIds, toWishlistError } = await import(
  './wishlistRepository'
)

describe('addWishlistItem', () => {
  it('writes only addedAt, using the artworkId as the document id (never duplicated as a field)', async () => {
    setDoc.mockResolvedValueOnce(undefined)
    await addWishlistItem('alice', 'a1')
    expect(doc).toHaveBeenCalledWith(expect.anything(), 'wishlists', 'alice', 'items', 'a1')
    expect(setDoc).toHaveBeenCalledWith(expect.anything(), { addedAt: 'SERVER_TIMESTAMP' })
  })

  it('throws a typed error when denied', async () => {
    setDoc.mockRejectedValueOnce({ code: 'permission-denied' })
    await expect(addWishlistItem('alice', 'a1')).rejects.toEqual({
      code: 'permission-denied',
      message: 'You do not have permission to do that.',
    })
  })
})

describe('removeWishlistItem', () => {
  it('deletes the item document', async () => {
    deleteDoc.mockResolvedValueOnce(undefined)
    await removeWishlistItem('alice', 'a1')
    expect(deleteDoc).toHaveBeenCalledTimes(1)
  })

  it('throws a typed error when denied', async () => {
    deleteDoc.mockRejectedValueOnce({ code: 'permission-denied' })
    await expect(removeWishlistItem('alice', 'a1')).rejects.toEqual({
      code: 'permission-denied',
      message: 'You do not have permission to do that.',
    })
  })
})

describe('subscribeWishlistIds', () => {
  it('subscribes exactly once and maps document ids to a Set', () => {
    const onData = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, successCallback: (snap: unknown) => void) => {
      successCallback({ docs: [{ id: 'a1' }, { id: 'a2' }] })
      return vi.fn()
    })
    subscribeWishlistIds('alice', onData, vi.fn())
    expect(onSnapshot).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith(new Set(['a1', 'a2']))
  })

  it('returns an empty Set for an empty wishlist', () => {
    const onData = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, successCallback: (snap: unknown) => void) => {
      successCallback({ docs: [] })
      return vi.fn()
    })
    subscribeWishlistIds('alice', onData, vi.fn())
    expect(onData).toHaveBeenCalledWith(new Set())
  })

  it('maps a listener error via toWishlistError', () => {
    const onError = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, _onData, errorCallback: (error: unknown) => void) => {
      errorCallback({ code: 'unavailable' })
      return vi.fn()
    })
    subscribeWishlistIds('alice', vi.fn(), onError)
    expect(onError).toHaveBeenCalledWith({ code: 'network', message: 'Network unavailable. Check your connection and try again.' })
  })

  it('returns the underlying unsubscribe function', () => {
    const unsubscribe = vi.fn()
    onSnapshot.mockReturnValueOnce(unsubscribe)
    const result = subscribeWishlistIds('alice', vi.fn(), vi.fn())
    expect(result).toBe(unsubscribe)
  })
})

describe('toWishlistError', () => {
  it('falls back to unknown for an unrecognized error', () => {
    expect(toWishlistError(new Error('boom'))).toEqual({ code: 'unknown', message: 'Something went wrong. Please try again.' })
  })
})
