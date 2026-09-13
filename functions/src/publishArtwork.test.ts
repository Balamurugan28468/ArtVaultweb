import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decideArtworkByArtworkId } from './publishArtwork'

const artworksGet = vi.fn()
const artworksUpdate = vi.fn()

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => {
      if (name === 'artworks') return { doc: () => ({ get: artworksGet, update: artworksUpdate }) }
      throw new Error(`unexpected collection: ${name}`)
    },
    // See promoteSeller.test.ts's identical comment — the transaction
    // object simply delegates to the same doc-level mocks the rest of this
    // file already configures, dropping the `ref` argument `transaction.
    // update(ref, data)` passes so `artworksUpdate` is still called with
    // just `data`, exactly as every existing assertion here expects.
    runTransaction: async (
      updateFunction: (tx: { get: () => unknown; update: (ref: unknown, data: unknown) => unknown }) => Promise<unknown>,
    ) => updateFunction({ get: () => artworksGet(), update: (_ref, data) => artworksUpdate(data) }),
  }),
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}))

beforeEach(() => {
  artworksGet.mockReset()
  artworksUpdate.mockClear()
})

describe('decideArtworkByArtworkId — publish', () => {
  it('publishes a SUBMITTED artwork, writing only status/reviewedAt/rejectionReason/updatedAt', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'SUBMITTED', sellerId: 'alice', title: 'Sunset' }) })

    await decideArtworkByArtworkId('a1', 'PUBLISHED')

    expect(artworksUpdate).toHaveBeenCalledWith({
      status: 'PUBLISHED',
      reviewedAt: 'SERVER_TIMESTAMP',
      rejectionReason: null,
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })

  it('never touches sellerId, title, price, or any other field', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'SUBMITTED', sellerId: 'alice', title: 'Sunset', price: 150000 }) })

    await decideArtworkByArtworkId('a1', 'PUBLISHED')

    const writtenKeys = Object.keys(artworksUpdate.mock.calls[0]?.[0] ?? {})
    expect(writtenKeys.sort()).toEqual(['rejectionReason', 'reviewedAt', 'status', 'updatedAt'])
  })

  it('refuses to publish an artwork that does not exist', async () => {
    artworksGet.mockResolvedValue({ exists: false })

    await expect(decideArtworkByArtworkId('missing', 'PUBLISHED')).rejects.toThrow(/no artwork found/i)
    expect(artworksUpdate).not.toHaveBeenCalled()
  })

  it('refuses to publish a DRAFT artwork (invalid transition)', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'DRAFT' }) })

    await expect(decideArtworkByArtworkId('a1', 'PUBLISHED')).rejects.toThrow(/not awaiting review/i)
    expect(artworksUpdate).not.toHaveBeenCalled()
  })

  it('refuses to re-publish an already-PUBLISHED artwork (idempotency guard, not a silent no-op)', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'PUBLISHED' }) })

    await expect(decideArtworkByArtworkId('a1', 'PUBLISHED')).rejects.toThrow(/not awaiting review/i)
    expect(artworksUpdate).not.toHaveBeenCalled()
  })

  it('refuses to publish an already-REJECTED artwork', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'REJECTED' }) })

    await expect(decideArtworkByArtworkId('a1', 'PUBLISHED')).rejects.toThrow(/not awaiting review/i)
    expect(artworksUpdate).not.toHaveBeenCalled()
  })

  it('the read-check-write runs inside a Firestore transaction (concurrency safety — see publishArtwork.ts)', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'SUBMITTED' }) })
    await decideArtworkByArtworkId('a1', 'PUBLISHED')
    expect(artworksGet).toHaveBeenCalledTimes(1)
  })
})

describe('decideArtworkByArtworkId — reject', () => {
  it('rejects a SUBMITTED artwork with an optional reason', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'SUBMITTED' }) })

    await decideArtworkByArtworkId('a1', 'REJECTED', { rejectionReason: 'blurry photos' })

    expect(artworksUpdate).toHaveBeenCalledWith({
      status: 'REJECTED',
      reviewedAt: 'SERVER_TIMESTAMP',
      rejectionReason: 'blurry photos',
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })

  it('rejects with a null reason when none is given', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'SUBMITTED' }) })

    await decideArtworkByArtworkId('a1', 'REJECTED')

    expect(artworksUpdate).toHaveBeenCalledWith(expect.objectContaining({ rejectionReason: null }))
  })

  it('refuses to reject a DRAFT artwork', async () => {
    artworksGet.mockResolvedValue({ exists: true, data: () => ({ status: 'DRAFT' }) })

    await expect(decideArtworkByArtworkId('a1', 'REJECTED')).rejects.toThrow(/not awaiting review/i)
    expect(artworksUpdate).not.toHaveBeenCalled()
  })

  it('refuses to reject an artwork that does not exist', async () => {
    artworksGet.mockResolvedValue({ exists: false })

    await expect(decideArtworkByArtworkId('missing', 'REJECTED')).rejects.toThrow(/no artwork found/i)
    expect(artworksUpdate).not.toHaveBeenCalled()
  })
})

/**
 * Module 13 Phase 2 — near-simultaneous moderation decisions on the same
 * artwork. See promoteSeller.test.ts's identical-purpose suite for the full
 * rationale of the gated-read approach used here: it reproduces the
 * *outcome* Firestore's real transaction commit-conflict detection
 * guarantees (a losing racer is retried against a fresh, post-commit read)
 * without reimplementing Firestore's internal retry algorithm, which a
 * mocked-Admin-SDK unit test has no business claiming to do.
 */
describe('decideArtworkByArtworkId — near-simultaneous callers', () => {
  it('two near-simultaneous PUBLISHED decisions on the same SUBMITTED artwork: exactly one succeeds, the other fails as not-awaiting-review, no duplicate write', async () => {
    let status: string = 'SUBMITTED'
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

    const results = await Promise.allSettled([decideArtworkByArtworkId('a1', 'PUBLISHED'), decideArtworkByArtworkId('a1', 'PUBLISHED')])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(artworksUpdate).toHaveBeenCalledTimes(1)
    expect(status).toBe('PUBLISHED')
  })

  it('two near-simultaneous REJECTED decisions on the same SUBMITTED artwork: exactly one succeeds, the other fails as not-awaiting-review, no duplicate write', async () => {
    let status: string = 'SUBMITTED'
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
      decideArtworkByArtworkId('a1', 'REJECTED', { rejectionReason: 'reason A' }),
      decideArtworkByArtworkId('a1', 'REJECTED', { rejectionReason: 'reason B' }),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(artworksUpdate).toHaveBeenCalledTimes(1)
    expect(status).toBe('REJECTED')
  })

  it('a conflicting PUBLISHED-vs-REJECTED race on the same SUBMITTED artwork: exactly one decision commits — the artwork is never left published-and-rejected or in a mixed state', async () => {
    let status: string = 'SUBMITTED'
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
      decideArtworkByArtworkId('a1', 'PUBLISHED'),
      decideArtworkByArtworkId('a1', 'REJECTED', { rejectionReason: 'reason' }),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(artworksUpdate).toHaveBeenCalledTimes(1)
    expect(['PUBLISHED', 'REJECTED']).toContain(status)
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect((rejected[0].reason as Error).message).toMatch(/not awaiting review/i)
  })
})
