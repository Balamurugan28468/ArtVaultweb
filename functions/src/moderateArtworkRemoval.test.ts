import { beforeEach, describe, expect, it, vi } from 'vitest'
import { suspendArtworkByAdmin } from './moderateArtworkRemoval'

const artworksGet = vi.fn()
const artworksUpdate = vi.fn()
const logSet = vi.fn()

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => {
      if (name === 'artworks') return { doc: () => ({ get: artworksGet, update: artworksUpdate }) }
      if (name === 'adminLogs') return { doc: () => ({ set: logSet }) }
      throw new Error(`unexpected collection: ${name}`)
    },
    // Same pattern as publishArtwork.test.ts's own mock: the transaction
    // object delegates straight to the doc-level mocks, dropping the `ref`
    // argument so assertions can check the written data directly.
    runTransaction: async (
      updateFunction: (tx: {
        get: () => unknown
        update: (ref: unknown, data: unknown) => unknown
        set: (ref: unknown, data: unknown) => unknown
      }) => Promise<unknown>,
    ) =>
      updateFunction({
        get: () => artworksGet(),
        update: (_ref, data) => artworksUpdate(data),
        set: (_ref, data) => logSet(data),
      }),
  }),
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}))

beforeEach(() => {
  artworksGet.mockReset()
  artworksUpdate.mockClear()
  logSet.mockClear()
})

describe('suspendArtworkByAdmin', () => {
  it('suspends a PUBLISHED artwork, writing only status/reviewedAt/rejectionReason/updatedAt', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'PUBLISHED', sellerId: 'alice', title: 'Sunset' }) })

    const result = await suspendArtworkByAdmin('a1', 'Reported for a policy violation.', 'admin-1')

    expect(artworksUpdate).toHaveBeenCalledWith({
      status: 'SUSPENDED',
      reviewedAt: 'SERVER_TIMESTAMP',
      rejectionReason: 'Reported for a policy violation.',
      updatedAt: 'SERVER_TIMESTAMP',
    })
    expect(result).toEqual({ previousStatus: 'PUBLISHED' })
  })

  it('never touches sellerId, title, price, images, or any other field', async () => {
    artworksGet.mockResolvedValue({
      exists: true,
      data: () => ({ status: 'PUBLISHED', sellerId: 'alice', title: 'Sunset', price: 150000, images: [{ id: 'i1' }] }),
    })

    await suspendArtworkByAdmin('a1', 'reason', 'admin-1')

    const writtenKeys = Object.keys(artworksUpdate.mock.calls[0]?.[0] ?? {})
    expect(writtenKeys.sort()).toEqual(['rejectionReason', 'reviewedAt', 'status', 'updatedAt'])
  })

  it('suspends a SUBMITTED artwork', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'SUBMITTED' }) })
    const result = await suspendArtworkByAdmin('a1', 'reason', 'admin-1')
    expect(result).toEqual({ previousStatus: 'SUBMITTED' })
    expect(artworksUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUSPENDED' }))
  })

  it('suspends a DRAFT artwork — admin authority reaches every status, never just the public/queue ones', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'DRAFT' }) })
    const result = await suspendArtworkByAdmin('a1', 'reason', 'admin-1')
    expect(result).toEqual({ previousStatus: 'DRAFT' })
  })

  it('suspends a REJECTED artwork', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'REJECTED' }) })
    const result = await suspendArtworkByAdmin('a1', 'reason', 'admin-1')
    expect(result).toEqual({ previousStatus: 'REJECTED' })
  })

  it('refuses to suspend an artwork that does not exist', async () => {
    artworksGet.mockResolvedValue({ exists: false })
    await expect(suspendArtworkByAdmin('missing', 'reason', 'admin-1')).rejects.toThrow(/no artwork found/i)
    expect(artworksUpdate).not.toHaveBeenCalled()
    expect(logSet).not.toHaveBeenCalled()
  })

  it('refuses to re-suspend an already-SUSPENDED artwork (idempotency guard, not a silent no-op)', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'SUSPENDED' }) })
    await expect(suspendArtworkByAdmin('a1', 'reason', 'admin-1')).rejects.toThrow(/already suspended/i)
    expect(artworksUpdate).not.toHaveBeenCalled()
    expect(logSet).not.toHaveBeenCalled()
  })

  it('writes one audit log entry recording the admin uid, artwork id, previous status, resulting status, reason, and a server timestamp', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'PUBLISHED' }) })

    await suspendArtworkByAdmin('artwork-42', 'Counterfeit listing reported by a buyer.', 'admin-99')

    expect(logSet).toHaveBeenCalledTimes(1)
    expect(logSet).toHaveBeenCalledWith({
      action: 'ARTWORK_SUSPENDED',
      artworkId: 'artwork-42',
      adminUid: 'admin-99',
      previousStatus: 'PUBLISHED',
      resultingStatus: 'SUSPENDED',
      reason: 'Counterfeit listing reported by a buyer.',
      createdAt: 'SERVER_TIMESTAMP',
    })
  })

  it('never writes an audit log entry when the moderation write itself fails', async () => {
    artworksGet.mockResolvedValue({ exists: false })
    await expect(suspendArtworkByAdmin('missing', 'reason', 'admin-1')).rejects.toThrow()
    expect(logSet).not.toHaveBeenCalled()
  })

  it('the read-check-write (and audit log) run inside a single Firestore transaction', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'PUBLISHED' }) })
    await suspendArtworkByAdmin('a1', 'reason', 'admin-1')
    expect(artworksGet).toHaveBeenCalledTimes(1)
  })
})

/**
 * Near-simultaneous admin suspensions on the same artwork — same gated-read
 * approach as publishArtwork.test.ts's own identical-purpose suite (see
 * that file's doc comment for the full rationale): it reproduces the
 * *outcome* Firestore's real transaction commit-conflict detection
 * guarantees without reimplementing Firestore's internal retry algorithm.
 */
describe('suspendArtworkByAdmin — near-simultaneous callers', () => {
  it('two near-simultaneous suspensions of the same PUBLISHED artwork: exactly one succeeds, the other fails as already-suspended, no duplicate audit log', async () => {
    let status: string = 'PUBLISHED'
    let releaseSecondRead: () => void = () => {}
    const secondReadGate = new Promise<void>((resolve) => {
      releaseSecondRead = resolve
    })
    let getCallCount = 0

    artworksGet.mockImplementation(async () => {
      getCallCount += 1
      if (getCallCount === 2) await secondReadGate
      return { exists: true, data: () => ({ status }) }
    })
    artworksUpdate.mockImplementation(async (patch: { status: string }) => {
      status = patch.status
      releaseSecondRead()
    })

    const results = await Promise.allSettled([
      suspendArtworkByAdmin('a1', 'reason A', 'admin-1'),
      suspendArtworkByAdmin('a1', 'reason B', 'admin-2'),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(artworksUpdate).toHaveBeenCalledTimes(1)
    expect(logSet).toHaveBeenCalledTimes(1)
    expect(status).toBe('SUSPENDED')
  })
})
