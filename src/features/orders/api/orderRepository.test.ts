import { describe, expect, it, vi } from 'vitest'

const { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where } = vi.hoisted(() => ({
  collection: vi.fn(() => ({ path: 'orders' })),
  doc: vi.fn(() => ({ path: 'orders/o1' })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(() => 'ORDER_BY'),
  query: vi.fn(() => 'QUERY'),
  where: vi.fn(() => 'WHERE'),
}))

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return { ...actual, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where }
})
vi.mock('@/lib/firebase/config', () => ({ db: {} }))

const { getOrder, getOrderItems, mapToOrder, subscribeOrders, toOrderError } = await import('./orderRepository')

const BASE_ORDER_DATA = {
  buyerId: 'alice',
  status: 'PAID',
  paymentState: 'PAID',
  subtotal: 500000,
  total: 500000,
  createdAt: { toDate: () => new Date('2026-01-01') },
  updatedAt: { toDate: () => new Date('2026-01-01') },
}

describe('mapToOrder', () => {
  it('maps a well-formed document', () => {
    const order = mapToOrder('o1', BASE_ORDER_DATA)
    expect(order).toMatchObject({ id: 'o1', buyerId: 'alice', status: 'PAID', paymentState: 'PAID', total: 500000 })
  })

  it('returns null for a document missing buyerId', () => {
    expect(mapToOrder('o1', { ...BASE_ORDER_DATA, buyerId: undefined })).toBeNull()
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
    getDoc.mockResolvedValueOnce({ exists: () => false })
    expect(await getOrder('o1')).toBeNull()
  })

  it('returns the mapped order when it exists', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => true, id: 'o1', data: () => BASE_ORDER_DATA })
    const order = await getOrder('o1')
    expect(order?.id).toBe('o1')
  })

  // Same privacy contract as getPublicArtwork: a forged/guessed order id
  // belonging to another buyer must look exactly like one that never
  // existed, never surface as a distinguishable error.
  it('collapses permission-denied into null rather than throwing', async () => {
    getDoc.mockRejectedValueOnce({ code: 'permission-denied' })
    expect(await getOrder('o1')).toBeNull()
  })

  it('rethrows a genuine network error as a typed OrderError', async () => {
    getDoc.mockRejectedValueOnce({ code: 'unavailable' })
    await expect(getOrder('o1')).rejects.toEqual({
      code: 'network',
      message: 'Network unavailable. Check your connection and try again.',
    })
  })
})

describe('getOrderItems', () => {
  it('returns the mapped items for an order', async () => {
    getDocs.mockResolvedValueOnce({
      docs: [{ id: 'i1', data: () => ({ artworkId: 'art1', title: 'Sunset', unitPrice: 100, quantity: 1, subtotal: 100 }) }],
    })
    const items = await getOrderItems('o1')
    expect(items).toEqual([{ id: 'i1', artworkId: 'art1', sellerId: '', title: 'Sunset', imageUrl: null, unitPrice: 100, quantity: 1, subtotal: 100 }])
  })

  it('returns an empty array on permission-denied rather than throwing', async () => {
    getDocs.mockRejectedValueOnce({ code: 'permission-denied' })
    expect(await getOrderItems('o1')).toEqual([])
  })
})

describe('subscribeOrders', () => {
  it('queries by buyerId, newest first, and maps results', () => {
    const onData = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, successCallback: (snap: unknown) => void) => {
      successCallback({ docs: [{ id: 'o1', data: () => BASE_ORDER_DATA }] })
      return vi.fn()
    })
    subscribeOrders('alice', onData, vi.fn())
    expect(where).toHaveBeenCalledWith('buyerId', '==', 'alice')
    expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc')
    expect(onData).toHaveBeenCalledWith([expect.objectContaining({ id: 'o1', buyerId: 'alice' })])
  })

  it('filters out any malformed order document rather than crashing the list', () => {
    const onData = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, successCallback: (snap: unknown) => void) => {
      successCallback({ docs: [{ id: 'bad', data: () => ({ status: 'PAID' }) }] })
      return vi.fn()
    })
    subscribeOrders('alice', onData, vi.fn())
    expect(onData).toHaveBeenCalledWith([])
  })

  it('maps a listener error via toOrderError', () => {
    const onError = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, _onData, errorCallback: (error: unknown) => void) => {
      errorCallback({ code: 'permission-denied' })
      return vi.fn()
    })
    subscribeOrders('alice', vi.fn(), onError)
    expect(onError).toHaveBeenCalledWith({ code: 'permission-denied', message: 'You do not have permission to view that order.' })
  })
})

describe('toOrderError', () => {
  it('falls back to unknown for an unrecognized error', () => {
    expect(toOrderError(new Error('boom'))).toEqual({ code: 'unknown', message: 'Something went wrong. Please try again.' })
  })
})
