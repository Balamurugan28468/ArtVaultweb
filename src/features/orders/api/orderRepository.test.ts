import { describe, expect, it, vi } from 'vitest'

const { createClient, observe, result, signedImage } = vi.hoisted(() => {
  const builder = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), maybeSingle: vi.fn(), in: vi.fn() }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.maybeSingle.mockReturnValue(builder)
  builder.in.mockReturnValue(builder)
  return {
    createClient: vi.fn(() => ({ from: vi.fn(() => builder) })), observe: vi.fn(), result: vi.fn(), signedImage: vi.fn(),
  }
})

vi.mock('@/lib/supabase/client', () => ({ createClient }))
vi.mock('@/lib/supabase/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/data')>()), observe, result, signedImage,
}))

const { getOrder, getOrderItems, mapToOrder, subscribeOrders, toOrderError } = await import('./orderRepository')

const BASE_ORDER_DATA = {
  buyer_id: 'alice',
  status: 'PAID',
  payment_state: 'PAID', subtotal_minor: 500000, total_minor: 500000,
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
}

describe('mapToOrder', () => {
  it('preserves trusted reservation and incomplete-pricing metadata without assuming it for legacy orders', () => {
    expect(mapToOrder('o1', { ...BASE_ORDER_DATA, currency: 'INR', pricing_state: 'ITEMS_ONLY', reservation_status: 'ACTIVE', reservation_expires_at: '2026-09-17T00:00:00.000Z' })).toMatchObject({ currency: 'INR', pricingState: 'ITEMS_ONLY', reservationStatus: 'ACTIVE', reservationExpiresAt: expect.anything() })
    expect(mapToOrder('o1', BASE_ORDER_DATA)).not.toHaveProperty('reservationStatus')
  })
  it('maps a well-formed document', () => {
    const order = mapToOrder('o1', BASE_ORDER_DATA)
    expect(order).toMatchObject({ id: 'o1', buyerId: 'alice', status: 'PAID', paymentState: 'PAID', total: 500000 })
  })

  it('returns null for a document missing buyerId', () => {
    expect(mapToOrder('o1', { ...BASE_ORDER_DATA, buyer_id: undefined })).toBeNull()
  })

  it('returns null for a document with an unrecognized status — never fabricates a fallback lifecycle stage', () => {
    expect(mapToOrder('o1', { ...BASE_ORDER_DATA, status: 'NOT_A_REAL_STATUS' })).toBeNull()
  })

  it('defaults missing numeric fields to 0 rather than throwing', () => {
    const order = mapToOrder('o1', { buyerId: 'alice', status: 'CREATED' })
    expect(order).toMatchObject({ subtotal: 0, total: 0, shippingCost: null })
  })

  it('parses itemsPreview entries, dropping any malformed entry', () => {
    const order = mapToOrder('o1', {
      ...BASE_ORDER_DATA,
      itemsPreview: [{ title: 'Sunset', imageUrl: 'https://x/y.jpg', quantity: 2 }, { noTitle: true }],
    })
    expect(order?.itemsPreview).toEqual([{ title: 'Sunset', imageUrl: 'https://x/y.jpg', quantity: 2 }])
  })

  it('parses shippingAddress when present and well-formed', () => {
    const order = mapToOrder('o1', {
      ...BASE_ORDER_DATA,
      shippingAddress: { fullName: 'Alice', addressLine1: '1 Main St', city: 'Pune', state: 'MH', postalCode: '411001', country: 'India' },
    })
    expect(order?.shippingAddress).toMatchObject({ fullName: 'Alice', city: 'Pune' })
  })
})

describe('getOrder', () => {
  it('returns null for a nonexistent order', async () => {
    result.mockResolvedValueOnce(null)
    expect(await getOrder('o1')).toBeNull()
  })

  it('returns the mapped order when it exists', async () => {
    result.mockResolvedValueOnce({ id: 'o1', ...BASE_ORDER_DATA })
    result.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce(null).mockResolvedValueOnce([])
    const order = await getOrder('o1')
    expect(order?.id).toBe('o1')
  })

  // Same privacy contract as getPublicArtwork: a forged/guessed order id
  // belonging to another buyer must look exactly like one that never
  // existed, never surface as a distinguishable error.
  it('collapses permission-denied into null rather than throwing', async () => {
    result.mockRejectedValueOnce({ code: 'permission-denied' })
    expect(await getOrder('o1')).toBeNull()
  })

  it('rethrows a genuine network error as a typed OrderError', async () => {
    result.mockRejectedValueOnce(new TypeError('offline'))
    await expect(getOrder('o1')).rejects.toEqual({
      code: 'network',
      message: 'Network unavailable. Check your connection and try again.',
    })
  })
})

describe('getOrderItems', () => {
  it('returns the mapped items for an order', async () => {
    result.mockResolvedValueOnce([
      { id: 'i1', artwork_id: 'art1', title: 'Sunset', unit_price_minor: 100, quantity: 1, subtotal_minor: 100 },
    ])
    const items = await getOrderItems('o1')
    expect(items).toEqual([{ id: 'i1', artworkId: 'art1', sellerId: '', title: 'Sunset', imageUrl: null, unitPrice: 100, quantity: 1, subtotal: 100 }])
  })

  it('returns an empty array on permission-denied rather than throwing', async () => {
    result.mockRejectedValueOnce({ code: 'permission-denied' })
    expect(await getOrderItems('o1')).toEqual([])
  })
})

describe('subscribeOrders', () => {
  it('scopes the realtime subscription to the buyer and maps its refreshed rows', async () => {
    const onData = vi.fn()
    let read: (() => Promise<unknown>) | undefined
    observe.mockImplementationOnce((_table, _filter, readFunction) => { read = readFunction; return vi.fn() })
    result.mockResolvedValueOnce([{ id: 'o1', ...BASE_ORDER_DATA }])
    result.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce(null).mockResolvedValueOnce([])
    subscribeOrders('alice', onData, vi.fn())
    expect(observe).toHaveBeenCalledWith('orders', 'buyer_id=eq.alice', expect.any(Function), onData, expect.any(Function))
    await expect(read?.()).resolves.toEqual([expect.objectContaining({ id: 'o1', buyerId: 'alice' })])
  })

  it('filters malformed rows from the realtime refresh rather than crashing the list', async () => {
    let read: (() => Promise<unknown>) | undefined
    observe.mockImplementationOnce((_table, _filter, readFunction) => { read = readFunction; return vi.fn() })
    result.mockResolvedValueOnce([{ id: 'bad', status: 'PAID' }])
    result.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce(null).mockResolvedValueOnce([])
    subscribeOrders('alice', vi.fn(), vi.fn())
    await expect(read?.()).resolves.toEqual([])
  })

  it('forwards the typed realtime error supplied by the shared Supabase observer', () => {
    const onError = vi.fn()
    observe.mockImplementationOnce((_table, _filter, _read, _onData, errorCallback) => {
      errorCallback({ code: 'permission-denied', message: 'You do not have permission to do that.' })
      return vi.fn()
    })
    subscribeOrders('alice', vi.fn(), onError)
    expect(onError).toHaveBeenCalledWith({ code: 'permission-denied', message: 'You do not have permission to do that.' })
  })
})

describe('toOrderError', () => {
  it('falls back to unknown for an unrecognized error', () => {
    expect(toOrderError(new Error('boom'))).toEqual({ code: 'unknown', message: 'Something went wrong. Please try again.' })
  })
})

it.each([undefined, null, '', 'UNKNOWN', 'paid', 42])('does not fabricate a payment state from %j', (paymentState) => {
  expect(mapToOrder('a1', { buyerId: 'buyer', status: 'CREATED', paymentState })?.paymentState).toBeNull()
})
