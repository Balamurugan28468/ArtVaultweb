import { describe, expect, it, vi } from 'vitest'

const { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } = vi.hoisted(() => ({
  collection: vi.fn(() => ({ path: 'carts/alice/items' })),
  deleteDoc: vi.fn(),
  doc: vi.fn(() => ({ path: 'carts/alice/items/a1' })),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}))

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return { ...actual, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc }
})
vi.mock('@/lib/firebase/config', () => ({ db: {} }))

const { clampCartQuantity, createCartItem, removeCartItem, subscribeCartQuantities, toCartError, updateCartItemQuantity } =
  await import('./cartRepository')

describe('clampCartQuantity', () => {
  it('clamps to at least 1', () => {
    expect(clampCartQuantity(0)).toBe(1)
    expect(clampCartQuantity(-5)).toBe(1)
  })

  it('clamps to the 99 ceiling', () => {
    expect(clampCartQuantity(500)).toBe(99)
  })

  it('truncates a fractional quantity', () => {
    expect(clampCartQuantity(3.7)).toBe(3)
  })

  it('falls back to 1 for a non-finite value', () => {
    expect(clampCartQuantity(Number.NaN)).toBe(1)
  })
})

describe('createCartItem', () => {
  it('writes quantity (clamped) and a server addedAt, using the artworkId as the document id', async () => {
    setDoc.mockResolvedValueOnce(undefined)
    await createCartItem('alice', 'a1', 200)
    expect(doc).toHaveBeenCalledWith(expect.anything(), 'carts', 'alice', 'items', 'a1')
    expect(setDoc).toHaveBeenCalledWith(expect.anything(), { quantity: 99, addedAt: 'SERVER_TIMESTAMP' })
  })

  it('throws a typed error when denied', async () => {
    setDoc.mockRejectedValueOnce({ code: 'permission-denied' })
    await expect(createCartItem('alice', 'a1', 1)).rejects.toEqual({
      code: 'permission-denied',
      message: 'You do not have permission to do that.',
    })
  })
})

describe('updateCartItemQuantity', () => {
  it('updates only quantity — never touches addedAt (see firestore.rules)', async () => {
    updateDoc.mockResolvedValueOnce(undefined)
    await updateCartItemQuantity('alice', 'a1', 4)
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { quantity: 4 })
  })

  it('clamps an out-of-range quantity before writing', async () => {
    updateDoc.mockResolvedValueOnce(undefined)
    await updateCartItemQuantity('alice', 'a1', 0)
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { quantity: 1 })
  })
})

describe('removeCartItem', () => {
  it('deletes the item document', async () => {
    deleteDoc.mockResolvedValueOnce(undefined)
    await removeCartItem('alice', 'a1')
    expect(deleteDoc).toHaveBeenCalledTimes(1)
  })

  it('throws a typed error when denied', async () => {
    deleteDoc.mockRejectedValueOnce({ code: 'permission-denied' })
    await expect(removeCartItem('alice', 'a1')).rejects.toEqual({
      code: 'permission-denied',
      message: 'You do not have permission to do that.',
    })
  })
})

describe('subscribeCartQuantities', () => {
  it('subscribes exactly once and maps document ids to their quantity', () => {
    const onData = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, successCallback: (snap: unknown) => void) => {
      successCallback({
        docs: [
          { id: 'a1', data: () => ({ quantity: 2 }) },
          { id: 'a2', data: () => ({ quantity: 1 }) },
        ],
      })
      return vi.fn()
    })
    subscribeCartQuantities('alice', onData, vi.fn())
    expect(onSnapshot).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith(
      new Map([
        ['a1', 2],
        ['a2', 1],
      ]),
    )
  })

  it('defaults a malformed/missing quantity to 1 rather than dropping the item', () => {
    const onData = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, successCallback: (snap: unknown) => void) => {
      successCallback({ docs: [{ id: 'a1', data: () => ({}) }] })
      return vi.fn()
    })
    subscribeCartQuantities('alice', onData, vi.fn())
    expect(onData).toHaveBeenCalledWith(new Map([['a1', 1]]))
  })

  it('returns an empty Map for an empty cart', () => {
    const onData = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, successCallback: (snap: unknown) => void) => {
      successCallback({ docs: [] })
      return vi.fn()
    })
    subscribeCartQuantities('alice', onData, vi.fn())
    expect(onData).toHaveBeenCalledWith(new Map())
  })

  it('maps a listener error via toCartError', () => {
    const onError = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, _onData, errorCallback: (error: unknown) => void) => {
      errorCallback({ code: 'unavailable' })
      return vi.fn()
    })
    subscribeCartQuantities('alice', vi.fn(), onError)
    expect(onError).toHaveBeenCalledWith({ code: 'network', message: 'Network unavailable. Check your connection and try again.' })
  })

  it('returns the underlying unsubscribe function', () => {
    const unsubscribe = vi.fn()
    onSnapshot.mockReturnValueOnce(unsubscribe)
    const result = subscribeCartQuantities('alice', vi.fn(), vi.fn())
    expect(result).toBe(unsubscribe)
  })
})

describe('toCartError', () => {
  it('falls back to unknown for an unrecognized error', () => {
    expect(toCartError(new Error('boom'))).toEqual({ code: 'unknown', message: 'Something went wrong. Please try again.' })
  })
})
