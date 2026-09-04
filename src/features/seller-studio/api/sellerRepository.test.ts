import { Timestamp } from 'firebase/firestore'
import { describe, expect, it, vi } from 'vitest'

const { doc, onSnapshot, setDoc, serverTimestamp } = vi.hoisted(() => ({
  doc: vi.fn(() => ({ path: 'sellers/alice' })),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}))

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return { ...actual, doc, onSnapshot, setDoc, serverTimestamp }
})
vi.mock('@/lib/firebase/config', () => ({ db: {} }))

const { applyAsSeller, subscribeSellerApplication, toSellerError } = await import('./sellerRepository')

describe('applyAsSeller', () => {
  it('writes a PENDING application with a server timestamp, trimming free-text fields', async () => {
    setDoc.mockResolvedValueOnce(undefined)

    await applyAsSeller('alice', {
      businessName: '  Alice Fine Art  ',
      description: '  Contemporary landscapes.  ',
      contactEmail: '  alice@example.com  ',
    })

    expect(setDoc).toHaveBeenCalledWith(expect.anything(), {
      uid: 'alice',
      status: 'PENDING',
      businessName: 'Alice Fine Art',
      description: 'Contemporary landscapes.',
      contactEmail: 'alice@example.com',
      appliedAt: 'SERVER_TIMESTAMP',
      reviewedAt: null,
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })

  it('throws a typed SellerError when the write is denied (e.g. a duplicate application)', async () => {
    setDoc.mockRejectedValueOnce({ code: 'permission-denied' })

    await expect(
      applyAsSeller('alice', { businessName: 'A', description: 'B', contactEmail: 'a@example.com' }),
    ).rejects.toEqual({ code: 'permission-denied', message: 'You do not have permission to do that.' })
  })
})

describe('toSellerError', () => {
  it('maps unavailable to a network error', () => {
    expect(toSellerError({ code: 'unavailable' })).toEqual({
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
  it('subscribes exactly once and returns the underlying unsubscribe function', () => {
    const unsubscribe = vi.fn()
    onSnapshot.mockReturnValueOnce(unsubscribe)

    const result = subscribeSellerApplication('alice', vi.fn(), vi.fn())

    expect(onSnapshot).toHaveBeenCalledTimes(1)
    expect(result).toBe(unsubscribe)
  })

  it('maps a snapshot to a SellerApplication', () => {
    const now = Timestamp.now()
    const onData = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, successCallback: (snap: unknown) => void) => {
      successCallback({
        exists: () => true,
        data: () => ({
          status: 'PENDING',
          businessName: 'Alice Fine Art',
          description: 'desc',
          contactEmail: 'alice@example.com',
          appliedAt: now,
          reviewedAt: null,
          createdAt: now,
          updatedAt: now,
        }),
      })
      return vi.fn()
    })

    subscribeSellerApplication('alice', onData, vi.fn())

    expect(onData).toHaveBeenCalledWith({
      uid: 'alice',
      status: 'PENDING',
      businessName: 'Alice Fine Art',
      description: 'desc',
      contactEmail: 'alice@example.com',
      appliedAt: now,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    })
  })

  it('reports null when no application document exists', () => {
    const onData = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, successCallback: (snap: unknown) => void) => {
      successCallback({ exists: () => false })
      return vi.fn()
    })

    subscribeSellerApplication('alice', onData, vi.fn())

    expect(onData).toHaveBeenCalledWith(null)
  })
})
