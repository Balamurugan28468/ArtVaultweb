import { beforeEach, describe, expect, it, vi } from 'vitest'

const collectionGroupGet = vi.fn()
const update = vi.fn()

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }))
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collectionGroup: (name: string) => {
      if (name !== 'artworks') throw new Error(`unexpected collection group: ${name}`)
      return { get: collectionGroupGet }
    },
  }),
}))

const { backfillLikeCount, BackfillAbortedError } = await import('./backfillLikeCount')

function fakeDoc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data, ref: { update } }
}

beforeEach(() => {
  collectionGroupGet.mockReset()
  update.mockReset()
})

describe('backfillLikeCount — dry run (apply: false)', () => {
  it('reports a document with no likeCount field as would-set-zero, and never writes', async () => {
    collectionGroupGet.mockResolvedValueOnce({ docs: [fakeDoc('a1', { status: 'PUBLISHED', title: 'x' })] })

    const results = await backfillLikeCount({ apply: false })

    expect(results).toEqual([{ id: 'a1', status: 'PUBLISHED', action: 'would-set-zero' }])
    expect(update).not.toHaveBeenCalled()
  })

  it('reports a document with a valid non-negative integer likeCount as already-valid', async () => {
    collectionGroupGet.mockResolvedValueOnce({ docs: [fakeDoc('a1', { status: 'PUBLISHED', likeCount: 7 })] })

    const results = await backfillLikeCount({ apply: false })

    expect(results).toEqual([{ id: 'a1', status: 'PUBLISHED', action: 'already-valid' }])
    expect(update).not.toHaveBeenCalled()
  })

  it('treats likeCount: 0 as already valid, not as "missing"', async () => {
    collectionGroupGet.mockResolvedValueOnce({ docs: [fakeDoc('a1', { status: 'PUBLISHED', likeCount: 0 })] })

    const results = await backfillLikeCount({ apply: false })

    expect(results[0].action).toBe('already-valid')
  })

  it('flags a non-numeric likeCount as malformed, without touching it or aborting the dry run', async () => {
    collectionGroupGet.mockResolvedValueOnce({ docs: [fakeDoc('a1', { status: 'PUBLISHED', likeCount: 'seven' })] })

    const results = await backfillLikeCount({ apply: false })

    expect(results).toEqual([{ id: 'a1', status: 'PUBLISHED', action: 'malformed', existingValue: 'seven' }])
    expect(update).not.toHaveBeenCalled()
  })

  it('flags a negative likeCount as malformed', async () => {
    collectionGroupGet.mockResolvedValueOnce({ docs: [fakeDoc('a1', { status: 'PUBLISHED', likeCount: -1 })] })
    const results = await backfillLikeCount({ apply: false })
    expect(results[0].action).toBe('malformed')
  })

  it('flags a non-integer (float) likeCount as malformed', async () => {
    collectionGroupGet.mockResolvedValueOnce({ docs: [fakeDoc('a1', { status: 'PUBLISHED', likeCount: 2.5 })] })
    const results = await backfillLikeCount({ apply: false })
    expect(results[0].action).toBe('malformed')
  })

  it('reports every document independently across a mixed set, in one pass', async () => {
    collectionGroupGet.mockResolvedValueOnce({
      docs: [
        fakeDoc('missing', { status: 'PUBLISHED' }),
        fakeDoc('valid', { status: 'PUBLISHED', likeCount: 3 }),
        fakeDoc('bad', { status: 'SUBMITTED', likeCount: 'x' }),
      ],
    })

    const results = await backfillLikeCount({ apply: false })

    expect(results.map((r) => [r.id, r.action])).toEqual([
      ['missing', 'would-set-zero'],
      ['valid', 'already-valid'],
      ['bad', 'malformed'],
    ])
    expect(update).not.toHaveBeenCalled()
  })
})

describe('backfillLikeCount — apply (apply: true)', () => {
  it('writes likeCount: 0, and only likeCount: 0, to a document missing the field', async () => {
    collectionGroupGet.mockResolvedValueOnce({
      docs: [fakeDoc('a1', { status: 'PUBLISHED', title: 'x', price: 500 })],
    })

    const results = await backfillLikeCount({ apply: true })

    expect(update).toHaveBeenCalledTimes(1)
    // Not objectContaining — the exact, complete update payload must be
    // {likeCount: 0} alone, proving no other field can ever be touched.
    expect(update).toHaveBeenCalledWith({ likeCount: 0 })
    expect(results).toEqual([{ id: 'a1', status: 'PUBLISHED', action: 'set-to-zero' }])
  })

  it('never writes to a document that already has a valid likeCount', async () => {
    collectionGroupGet.mockResolvedValueOnce({ docs: [fakeDoc('a1', { status: 'PUBLISHED', likeCount: 5 })] })

    await backfillLikeCount({ apply: true })

    expect(update).not.toHaveBeenCalled()
  })

  it('is idempotent: running apply a second time (all docs now valid) performs zero writes', async () => {
    collectionGroupGet.mockResolvedValueOnce({ docs: [fakeDoc('a1', { status: 'PUBLISHED' })] })
    await backfillLikeCount({ apply: true })
    expect(update).toHaveBeenCalledTimes(1)

    update.mockClear()
    collectionGroupGet.mockResolvedValueOnce({ docs: [fakeDoc('a1', { status: 'PUBLISHED', likeCount: 0 })] })
    const secondRun = await backfillLikeCount({ apply: true })

    expect(update).not.toHaveBeenCalled()
    expect(secondRun).toEqual([{ id: 'a1', status: 'PUBLISHED', action: 'already-valid' }])
  })

  it('aborts the entire run with zero writes when any document has a malformed likeCount', async () => {
    collectionGroupGet.mockResolvedValueOnce({
      docs: [
        fakeDoc('missing', { status: 'PUBLISHED' }),
        fakeDoc('bad', { status: 'PUBLISHED', likeCount: 'x' }),
      ],
    })

    await expect(backfillLikeCount({ apply: true })).rejects.toThrow(BackfillAbortedError)
    // Zero writes — including to 'missing', which was otherwise a valid
    // candidate — because the run aborts before any write happens at all.
    expect(update).not.toHaveBeenCalled()
  })

  it('the abort error names the exact malformed document id and its existing value', async () => {
    collectionGroupGet.mockResolvedValueOnce({
      docs: [fakeDoc('bad', { status: 'REJECTED', likeCount: -3 })],
    })

    await expect(backfillLikeCount({ apply: true })).rejects.toMatchObject({
      malformed: [{ id: 'bad', status: 'REJECTED', action: 'malformed', existingValue: -3 }],
    })
  })
})
