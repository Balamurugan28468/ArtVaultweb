import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const cartLookup = { eq: vi.fn(), maybeSingle: vi.fn() }
  cartLookup.eq.mockReturnValue(cartLookup)
  cartLookup.maybeSingle.mockReturnValue(cartLookup)
  const cartInsertResult = { single: vi.fn() }
  const cartInsert = { select: vi.fn() }
  cartInsert.select.mockReturnValue(cartInsertResult)
  const carts = { select: vi.fn(), insert: vi.fn() }
  carts.select.mockReturnValue(cartLookup)
  carts.insert.mockReturnValue(cartInsert)
  const cartItems = { insert: vi.fn(), update: vi.fn(), delete: vi.fn(), eq: vi.fn(), select: vi.fn() }
  cartItems.insert.mockReturnValue(cartItems)
  cartItems.update.mockReturnValue(cartItems)
  cartItems.delete.mockReturnValue(cartItems)
  cartItems.eq.mockReturnValue(cartItems)
  cartItems.select.mockReturnValue(cartItems)
  const from = vi.fn((table: string) => table === 'carts' ? carts : cartItems)
  return {
    createClient: vi.fn(() => ({ from })), from, observe: vi.fn(), requireIdentity: vi.fn(), result: vi.fn(),
    carts, cartItems, cartInsertResult,
  }
})

vi.mock('@/lib/supabase/client', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/data')>()),
  observe: mocks.observe, requireIdentity: mocks.requireIdentity, result: mocks.result,
}))

const { clampCartQuantity, createCartItem, removeCartItem, subscribeCartQuantities, toCartError, updateCartItemQuantity } =
  await import('./cartRepository')

beforeEach(() => {
  mocks.observe.mockReset()
  mocks.requireIdentity.mockReset().mockResolvedValue(undefined)
  mocks.result.mockReset()
  mocks.from.mockClear()
  mocks.carts.insert.mockClear()
  mocks.cartItems.insert.mockClear()
  mocks.cartItems.update.mockClear()
  mocks.cartItems.delete.mockClear()
  mocks.cartInsertResult.single.mockReset().mockResolvedValue({ data: { id: 'cart-1' }, error: null })
})

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
    mocks.result.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    await createCartItem('alice', 'a1', 200)
    expect(mocks.requireIdentity).toHaveBeenCalledWith('alice')
    expect(mocks.carts.insert).toHaveBeenCalledWith({ user_id: 'alice' })
    expect(mocks.cartItems.insert).toHaveBeenCalledWith({ cart_id: 'cart-1', artwork_id: 'a1', quantity: 99 })
  })

  it('throws a typed error when denied', async () => {
    mocks.result.mockResolvedValueOnce(null).mockRejectedValueOnce({ code: 'permission-denied', message: 'You do not have permission to do that.' })
    await expect(createCartItem('alice', 'a1', 1)).rejects.toEqual({
      code: 'permission-denied',
      message: 'You do not have permission to do that.',
    })
  })
})

describe('updateCartItemQuantity', () => {
  it('updates only quantity — never touches addedAt (see firestore.rules)', async () => {
    mocks.result.mockResolvedValueOnce({ id: 'cart-1' }).mockResolvedValueOnce([{ id: 'item-1' }])
    await updateCartItemQuantity('alice', 'a1', 4)
    expect(mocks.cartItems.update).toHaveBeenCalledWith({ quantity: 4 })
  })

  it('clamps an out-of-range quantity before writing', async () => {
    mocks.result.mockResolvedValueOnce({ id: 'cart-1' }).mockResolvedValueOnce([{ id: 'item-1' }])
    await updateCartItemQuantity('alice', 'a1', 0)
    expect(mocks.cartItems.update).toHaveBeenCalledWith({ quantity: 1 })
  })
})

describe('removeCartItem', () => {
  it('deletes the item document', async () => {
    mocks.result.mockResolvedValueOnce({ id: 'cart-1' }).mockResolvedValueOnce(null)
    await removeCartItem('alice', 'a1')
    expect(mocks.cartItems.delete).toHaveBeenCalledTimes(1)
  })

  it('throws a typed error when denied', async () => {
    mocks.result.mockResolvedValueOnce({ id: 'cart-1' }).mockRejectedValueOnce({ code: 'permission-denied', message: 'You do not have permission to do that.' })
    await expect(removeCartItem('alice', 'a1')).rejects.toEqual({
      code: 'permission-denied',
      message: 'You do not have permission to do that.',
    })
  })
})

describe('subscribeCartQuantities', () => {
  it('subscribes through Supabase Realtime and maps refreshed item rows to quantities', async () => {
    const onData = vi.fn()
    let read: (() => Promise<unknown>) | undefined
    mocks.observe.mockImplementationOnce((_table, _filter, readFunction) => { read = readFunction; return vi.fn() })
    mocks.result.mockResolvedValueOnce({ id: 'cart-1' }).mockResolvedValueOnce([
      { artwork_id: 'a1', quantity: 2 }, { artwork_id: 'a2', quantity: 1 },
    ])
    subscribeCartQuantities('alice', onData, vi.fn())
    expect(mocks.observe).toHaveBeenCalledWith('cart_items', undefined, expect.any(Function), onData, expect.any(Function))
    await expect(read?.()).resolves.toEqual(
      new Map([
        ['a1', 2],
        ['a2', 1],
      ]),
    )
  })

  it('defaults a malformed/missing quantity to 1 rather than dropping the item', async () => {
    let read: (() => Promise<unknown>) | undefined
    mocks.observe.mockImplementationOnce((_table, _filter, readFunction) => { read = readFunction; return vi.fn() })
    mocks.result.mockResolvedValueOnce({ id: 'cart-1' }).mockResolvedValueOnce([{ artwork_id: 'a1', quantity: undefined }])
    subscribeCartQuantities('alice', vi.fn(), vi.fn())
    await expect(read?.()).resolves.toEqual(new Map([['a1', 1]]))
  })

  it('returns an empty Map for an empty cart', async () => {
    let read: (() => Promise<unknown>) | undefined
    mocks.observe.mockImplementationOnce((_table, _filter, readFunction) => { read = readFunction; return vi.fn() })
    mocks.result.mockResolvedValueOnce(null)
    subscribeCartQuantities('alice', vi.fn(), vi.fn())
    await expect(read?.()).resolves.toEqual(new Map())
  })

  it('forwards a typed realtime error via toCartError', () => {
    const onError = vi.fn()
    mocks.observe.mockImplementationOnce((_table, _filter, _read, _onData, errorCallback) => {
      errorCallback({ code: 'network', message: 'Network unavailable. Check your connection and try again.' })
      return vi.fn()
    })
    subscribeCartQuantities('alice', vi.fn(), onError)
    expect(onError).toHaveBeenCalledWith({ code: 'network', message: 'Network unavailable. Check your connection and try again.' })
  })

  it('returns the underlying unsubscribe function', () => {
    const unsubscribe = vi.fn()
    mocks.observe.mockReturnValueOnce(unsubscribe)
    const result = subscribeCartQuantities('alice', vi.fn(), vi.fn())
    expect(result).toBe(unsubscribe)
  })
})

describe('toCartError', () => {
  it('falls back to unknown for an unrecognized error', () => {
    expect(toCartError(new Error('boom'))).toEqual({ code: 'unknown', message: 'Something went wrong. Please try again.' })
  })
})
