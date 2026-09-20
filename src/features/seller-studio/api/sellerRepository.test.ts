import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), insert: vi.fn() }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.maybeSingle.mockReturnValue(builder)
  builder.insert.mockReturnValue(builder)
  return {
    createClient: vi.fn(() => ({ from: vi.fn(() => builder) })), observe: vi.fn(),
    requireIdentity: vi.fn(), result: vi.fn(), builder,
  }
})

vi.mock('@/lib/supabase/client', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/data')>()),
  observe: mocks.observe, requireIdentity: mocks.requireIdentity, result: mocks.result,
}))

const { applyAsSeller, subscribeSellerApplication, toSellerError } = await import('./sellerRepository')

beforeEach(() => {
  mocks.observe.mockReset()
  mocks.requireIdentity.mockReset().mockResolvedValue(undefined)
  mocks.result.mockReset()
  mocks.builder.insert.mockClear()
})

describe('applyAsSeller', () => {
  it('writes application fields through the owner-scoped Supabase insert while status remains server-controlled', async () => {
    mocks.result.mockResolvedValueOnce(null)

    await applyAsSeller('alice', {
      businessName: '  Alice Fine Art  ',
      description: '  Contemporary landscapes.  ',
      contactEmail: '  alice@example.com  ',
    })

    expect(mocks.requireIdentity).toHaveBeenCalledWith('alice')
    expect(mocks.builder.insert).toHaveBeenCalledWith({
      id: 'alice', business_name: 'Alice Fine Art', description: 'Contemporary landscapes.', contact_email: 'alice@example.com',
    })
  })

  it('throws a typed SellerError when the write is denied (e.g. a duplicate application)', async () => {
    mocks.result.mockRejectedValueOnce({ code: '42501' })

    await expect(
      applyAsSeller('alice', { businessName: 'A', description: 'B', contactEmail: 'a@example.com' }),
    ).rejects.toEqual({ code: 'permission-denied', message: 'You do not have permission to do that.' })
  })
})

describe('toSellerError', () => {
  it('maps a network failure to a network error', () => {
    expect(toSellerError(new TypeError('offline'))).toEqual({
      code: 'network',
      message: 'Network unavailable. Check your connection and try again.',
    })
  })

  it('falls back to unknown for an unrecognized error', () => {
    expect(toSellerError(new Error('boom'))).toEqual({
      code: 'unknown',
      message: 'Something went wrong. Please try again.',
    })
  })
})

describe('subscribeSellerApplication', () => {
  it('subscribes once through Supabase Realtime and returns the underlying cleanup function', () => {
    const unsubscribe = vi.fn()
    mocks.observe.mockReturnValueOnce(unsubscribe)

    const result = subscribeSellerApplication('alice', vi.fn(), vi.fn())

    expect(mocks.observe).toHaveBeenCalledWith('seller_profiles', 'id=eq.alice', expect.any(Function), expect.any(Function), expect.any(Function))
    expect(result).toBe(unsubscribe)
  })

  it('maps a refreshed Supabase row to a SellerApplication', async () => {
    let read: (() => Promise<unknown>) | undefined
    mocks.observe.mockImplementationOnce((_table, _filter, readFunction) => { read = readFunction; return vi.fn() })
    mocks.result.mockResolvedValueOnce({
      id: 'alice', status: 'PENDING', business_name: 'Alice Fine Art', description: 'desc', contact_email: 'alice@example.com',
      created_at: '2026-09-19T10:00:00.000Z', updated_at: '2026-09-19T10:00:00.000Z', reviewed_at: null,
    })
    subscribeSellerApplication('alice', vi.fn(), vi.fn())
    await expect(read?.()).resolves.toMatchObject({
      uid: 'alice', status: 'PENDING', businessName: 'Alice Fine Art', contactEmail: 'alice@example.com', rejectionReason: null,
    })
  })

  it('maps a REJECTED row including its stored rejection reason', async () => {
    let read: (() => Promise<unknown>) | undefined
    mocks.observe.mockImplementationOnce((_table, _filter, readFunction) => { read = readFunction; return vi.fn() })
    mocks.result.mockResolvedValueOnce({
      id: 'alice', status: 'REJECTED', business_name: 'Alice Fine Art', description: 'desc', contact_email: 'alice@example.com',
      created_at: '2026-09-19T10:00:00.000Z', updated_at: '2026-09-20T10:00:00.000Z', reviewed_at: '2026-09-20T10:00:00.000Z',
      rejection_reason: 'Portfolio does not meet our quality guidelines.',
    })
    subscribeSellerApplication('alice', vi.fn(), vi.fn())
    await expect(read?.()).resolves.toMatchObject({ status: 'REJECTED', rejectionReason: 'Portfolio does not meet our quality guidelines.' })
  })

  it('defaults rejectionReason to null when missing/malformed — never trusts an unexpected type', () => {
    let read: (() => Promise<unknown>) | undefined
    mocks.observe.mockImplementationOnce((_table, _filter, readFunction) => { read = readFunction; return vi.fn() })
    mocks.result.mockResolvedValueOnce({
      id: 'alice', status: 'PENDING', business_name: 'Alice', description: 'desc', contact_email: 'a@example.com',
      created_at: '2026-09-19T10:00:00.000Z', updated_at: '2026-09-19T10:00:00.000Z', reviewed_at: null, rejection_reason: 12345,
    })
    subscribeSellerApplication('alice', vi.fn(), vi.fn())
    return expect(read?.()).resolves.toMatchObject({ rejectionReason: null })
  })

  it('reports null when no application document exists', async () => {
    let read: (() => Promise<unknown>) | undefined
    mocks.observe.mockImplementationOnce((_table, _filter, readFunction) => { read = readFunction; return vi.fn() })
    mocks.result.mockResolvedValueOnce(null)
    subscribeSellerApplication('alice', vi.fn(), vi.fn())
    return expect(read?.()).resolves.toBeNull()
  })
})
