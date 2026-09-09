import { describe, expect, it, vi } from 'vitest'

const { doc, getDoc, increment, serverTimestamp, writeBatch } = vi.hoisted(() => ({
  doc: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
  getDoc: vi.fn(),
  increment: vi.fn((n: number) => ({ __increment: n })),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  writeBatch: vi.fn(),
}))

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return { ...actual, doc, getDoc, increment, serverTimestamp, writeBatch }
})
vi.mock('@/lib/firebase/config', () => ({ db: {} }))

const { getAuthoritativeLikeState, hasLiked, likeArtwork, toLikeError, unlikeArtwork } = await import('./likeRepository')

function fakeBatch() {
  const batch = { set: vi.fn(), delete: vi.fn(), update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) }
  return batch
}

describe('hasLiked', () => {
  it('reads the caller-own like document and returns whether it exists', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => true })
    await expect(hasLiked('a1', 'alice')).resolves.toBe(true)
    expect(doc).toHaveBeenCalledWith(expect.anything(), 'likes', 'a1', 'by', 'alice')
  })

  it('returns false when no like document exists', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => false })
    await expect(hasLiked('a1', 'alice')).resolves.toBe(false)
  })

  it('throws a typed error on failure', async () => {
    getDoc.mockRejectedValueOnce({ code: 'permission-denied' })
    await expect(hasLiked('a1', 'alice')).rejects.toEqual({
      code: 'permission-denied',
      message: 'You do not have permission to do that.',
    })
  })
})

describe('likeArtwork', () => {
  it('commits one atomic batch: creates the like doc and increments likeCount by exactly 1', async () => {
    const batch = fakeBatch()
    writeBatch.mockReturnValueOnce(batch)
    await likeArtwork('a1', 'alice')

    expect(batch.set).toHaveBeenCalledWith(expect.anything(), { likedAt: 'SERVER_TIMESTAMP' })
    expect(batch.update).toHaveBeenCalledWith(expect.anything(), { likeCount: { __increment: 1 } })
    expect(batch.commit).toHaveBeenCalledTimes(1)
  })

  it('throws a typed error when the batch is rejected (e.g. by security rules)', async () => {
    const batch = fakeBatch()
    batch.commit.mockRejectedValueOnce({ code: 'permission-denied' })
    writeBatch.mockReturnValueOnce(batch)
    await expect(likeArtwork('a1', 'alice')).rejects.toEqual({
      code: 'permission-denied',
      message: 'You do not have permission to do that.',
    })
  })
})

describe('unlikeArtwork', () => {
  it('commits one atomic batch: deletes the like doc and decrements likeCount by exactly 1', async () => {
    const batch = fakeBatch()
    writeBatch.mockReturnValueOnce(batch)
    await unlikeArtwork('a1', 'alice')

    expect(batch.delete).toHaveBeenCalledTimes(1)
    expect(batch.update).toHaveBeenCalledWith(expect.anything(), { likeCount: { __increment: -1 } })
    expect(batch.commit).toHaveBeenCalledTimes(1)
  })

  it('throws a typed error when the batch is rejected', async () => {
    const batch = fakeBatch()
    batch.commit.mockRejectedValueOnce({ code: 'unavailable' })
    writeBatch.mockReturnValueOnce(batch)
    await expect(unlikeArtwork('a1', 'alice')).rejects.toEqual({
      code: 'network',
      message: 'Network unavailable. Check your connection and try again.',
    })
  })
})

describe('getAuthoritativeLikeState', () => {
  it('reports liked:true with the real likeCount when a like document exists', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => true }).mockResolvedValueOnce({ data: () => ({ likeCount: 7 }) })
    await expect(getAuthoritativeLikeState('a1', 'alice')).resolves.toEqual({ liked: true, likeCount: 7 })
  })

  it('reports liked:false when no like document exists', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => false }).mockResolvedValueOnce({ data: () => ({ likeCount: 3 }) })
    await expect(getAuthoritativeLikeState('a1', 'alice')).resolves.toEqual({ liked: false, likeCount: 3 })
  })

  it('defensively falls back to a likeCount of 0 for a missing/malformed field — never trusts an impossible value', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => false }).mockResolvedValueOnce({ data: () => ({}) })
    await expect(getAuthoritativeLikeState('a1', 'alice')).resolves.toEqual({ liked: false, likeCount: 0 })

    getDoc.mockResolvedValueOnce({ exists: () => false }).mockResolvedValueOnce({ data: () => ({ likeCount: -5 }) })
    await expect(getAuthoritativeLikeState('a1', 'alice')).resolves.toEqual({ liked: false, likeCount: 0 })
  })

  it('throws a typed error when the reconciliation read itself fails', async () => {
    getDoc.mockRejectedValueOnce({ code: 'unavailable' })
    await expect(getAuthoritativeLikeState('a1', 'alice')).rejects.toEqual({
      code: 'network',
      message: 'Network unavailable. Check your connection and try again.',
    })
  })
})

describe('toLikeError', () => {
  it('falls back to unknown for an unrecognized error', () => {
    expect(toLikeError(new Error('boom'))).toEqual({ code: 'unknown', message: 'Something went wrong. Please try again.' })
  })
})
