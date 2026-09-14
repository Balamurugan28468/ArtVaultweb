import { Timestamp } from 'firebase/firestore'
import { describe, expect, it, vi } from 'vitest'
import type { ArtworkImage } from '../types'

const { addDoc, collection, deleteDoc, doc, onSnapshot, query, runTransaction, updateDoc, where, serverTimestamp } = vi.hoisted(
  () => ({
    addDoc: vi.fn(),
    collection: vi.fn(() => ({ path: 'artworks' })),
    deleteDoc: vi.fn(),
    doc: vi.fn(() => ({ path: 'artworks/a1' })),
    onSnapshot: vi.fn(),
    query: vi.fn((...args: unknown[]) => ({ args })),
    runTransaction: vi.fn(),
    updateDoc: vi.fn(),
    where: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  }),
)

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return { ...actual, addDoc, collection, deleteDoc, doc, onSnapshot, query, runTransaction, updateDoc, where, serverTimestamp }
})
vi.mock('@/lib/firebase/config', () => ({ db: {} }))

const {
  createArtworkDraft,
  deleteOwnedArtwork,
  mapToArtwork,
  mutateArtworkImages,
  removeArtworkFromSale,
  resubmitArtworkForReview,
  subscribeArtwork,
  subscribePublishedArtworks,
  subscribeSellerArtworks,
  submitArtwork,
  toArtworkError,
  updateArtworkDraft,
  updatePublishedArtworkSafeFields,
} = await import('./artworkRepository')

const INPUT = {
  title: '  Sunset  ',
  description: '  A painting.  ',
  price: 1500,
  category: 'painting',
  tags: ['blue', 'abstract'],
  inventoryCount: 2,
}

describe('createArtworkDraft', () => {
  it('writes a new DRAFT with trimmed text fields, empty images, and server timestamps', async () => {
    addDoc.mockResolvedValueOnce({ id: 'a1' })

    const id = await createArtworkDraft('alice', INPUT)

    expect(id).toBe('a1')
    expect(addDoc).toHaveBeenCalledWith(expect.anything(), {
      sellerId: 'alice',
      title: 'Sunset',
      description: 'A painting.',
      price: 1500,
      category: 'painting',
      tags: ['blue', 'abstract'],
      images: [],
      inventoryCount: 2,
      status: 'DRAFT',
      createdAt: 'SERVER_TIMESTAMP',
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })

  it('throws a typed ArtworkError when the write is denied', async () => {
    addDoc.mockRejectedValueOnce({ code: 'permission-denied' })
    await expect(createArtworkDraft('alice', INPUT)).rejects.toEqual({
      code: 'permission-denied',
      message: 'You do not have permission to do that.',
    })
  })
})

describe('updateArtworkDraft', () => {
  it('writes the editable fields plus a fresh updatedAt, never sellerId/status/images', async () => {
    updateDoc.mockResolvedValueOnce(undefined)

    await updateArtworkDraft('a1', INPUT)

    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), {
      title: 'Sunset',
      description: 'A painting.',
      price: 1500,
      category: 'painting',
      tags: ['blue', 'abstract'],
      inventoryCount: 2,
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })
})

describe('submitArtwork', () => {
  it('writes only status and updatedAt', async () => {
    updateDoc.mockResolvedValueOnce(undefined)
    await submitArtwork('a1')
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { status: 'SUBMITTED', updatedAt: 'SERVER_TIMESTAMP' })
  })
})

describe('updatePublishedArtworkSafeFields (Module 13 Phase 4)', () => {
  it('writes only price/inventoryCount/tags plus a fresh updatedAt — never status/title/description/category/images', async () => {
    updateDoc.mockResolvedValueOnce(undefined)

    await updatePublishedArtworkSafeFields('a1', { price: 1750, inventoryCount: 4, tags: ['updated'] })

    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), {
      price: 1750,
      inventoryCount: 4,
      tags: ['updated'],
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })

  it('translates a raw Firestore error into a safe ArtworkError', async () => {
    updateDoc.mockRejectedValueOnce({ code: 'permission-denied' })
    await expect(updatePublishedArtworkSafeFields('a1', { price: 1, inventoryCount: 1, tags: [] })).rejects.toMatchObject({
      code: 'permission-denied',
    })
  })
})

describe('resubmitArtworkForReview (Module 13 Phase 4; images added by its photo-editing follow-up)', () => {
  const IMAGES: ArtworkImage[] = [
    { id: 'img1.jpg', path: 'artworks/alice/a1/img1.jpg', url: 'https://example.test/img1.jpg', order: 0, contentType: 'image/jpeg', size: 100 },
  ]

  it('writes the full editable field set including images, forces status to SUBMITTED, and clears reviewedAt/rejectionReason', async () => {
    updateDoc.mockResolvedValueOnce(undefined)

    await resubmitArtworkForReview('a1', INPUT, IMAGES)

    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), {
      title: 'Sunset',
      description: 'A painting.',
      price: 1500,
      category: 'painting',
      tags: ['blue', 'abstract'],
      images: IMAGES,
      inventoryCount: 2,
      status: 'SUBMITTED',
      reviewedAt: null,
      rejectionReason: null,
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })

  it('translates a raw Firestore error into a safe ArtworkError', async () => {
    updateDoc.mockRejectedValueOnce({ code: 'permission-denied' })
    await expect(resubmitArtworkForReview('a1', INPUT, IMAGES)).rejects.toMatchObject({ code: 'permission-denied' })
  })
})

describe('deleteOwnedArtwork', () => {
  it('deletes the document', async () => {
    deleteDoc.mockResolvedValueOnce(undefined)
    await deleteOwnedArtwork('a1')
    expect(deleteDoc).toHaveBeenCalledTimes(1)
  })

  it('throws a typed ArtworkError when denied (e.g. attempting to delete a SUBMITTED or PUBLISHED artwork)', async () => {
    deleteDoc.mockRejectedValueOnce({ code: 'permission-denied' })
    await expect(deleteOwnedArtwork('a1')).rejects.toEqual({
      code: 'permission-denied',
      message: 'You do not have permission to do that.',
    })
  })
})

describe('removeArtworkFromSale', () => {
  it('moves the artwork to SUBMITTED and clears reviewedAt/rejectionReason, touching no content field', async () => {
    updateDoc.mockResolvedValueOnce(undefined)
    await removeArtworkFromSale('a1')
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), {
      status: 'SUBMITTED',
      reviewedAt: null,
      rejectionReason: null,
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })

  it('throws a typed ArtworkError when denied (e.g. attempting this on a non-owned artwork)', async () => {
    updateDoc.mockRejectedValueOnce({ code: 'permission-denied' })
    await expect(removeArtworkFromSale('a1')).rejects.toEqual({
      code: 'permission-denied',
      message: 'You do not have permission to do that.',
    })
  })
})

describe('toArtworkError', () => {
  it('maps unavailable to a network error', () => {
    expect(toArtworkError({ code: 'unavailable' })).toEqual({
      code: 'network',
      message: 'Network unavailable. Check your connection and try again.',
    })
  })

  it('falls back to unknown for an unrecognized error', () => {
    expect(toArtworkError(new Error('boom'))).toEqual({ code: 'unknown', message: 'Something went wrong. Please try again.' })
  })
})

describe('mapToArtwork — likeCount defensive mapping (Module 12)', () => {
  const BASE = { sellerId: 'alice', status: 'PUBLISHED' as const }

  it('retains a valid likeCount', () => {
    expect(mapToArtwork('a1', { ...BASE, likeCount: 42 })?.likeCount).toBe(42)
  })

  it('defaults to 0 when likeCount is absent — a pre-Module-12 document that predates the field', () => {
    expect(mapToArtwork('a1', { ...BASE })?.likeCount).toBe(0)
  })

  it('defaults to 0 when likeCount is malformed (wrong type)', () => {
    expect(mapToArtwork('a1', { ...BASE, likeCount: 'lots' })?.likeCount).toBe(0)
  })

  it('defaults to 0 when likeCount is negative — never trusts an impossible value', () => {
    expect(mapToArtwork('a1', { ...BASE, likeCount: -3 })?.likeCount).toBe(0)
  })
})

describe('subscribeArtwork', () => {
  it('subscribes exactly once and returns the underlying unsubscribe function', () => {
    const unsubscribe = vi.fn()
    onSnapshot.mockReturnValueOnce(unsubscribe)
    const result = subscribeArtwork('a1', vi.fn(), vi.fn())
    expect(onSnapshot).toHaveBeenCalledTimes(1)
    expect(result).toBe(unsubscribe)
  })

  it('reports null when the artwork does not exist', () => {
    const onData = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, successCallback: (snap: unknown) => void) => {
      successCallback({ exists: () => false })
      return vi.fn()
    })
    subscribeArtwork('a1', onData, vi.fn())
    expect(onData).toHaveBeenCalledWith(null)
  })

  it('treats a document with a missing sellerId or unrecognized status as unreadable rather than crashing', () => {
    const onData = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, successCallback: (snap: unknown) => void) => {
      successCallback({ exists: () => true, data: () => ({ status: 'NOT_A_REAL_STATUS' }) })
      return vi.fn()
    })
    subscribeArtwork('a1', onData, vi.fn())
    expect(onData).toHaveBeenCalledWith(null)
  })

  it('recognizes PUBLISHED and REJECTED as valid statuses (Module 07)', () => {
    const onData = vi.fn()
    const reviewedAt = Timestamp.fromMillis(1000)
    onSnapshot.mockImplementationOnce((_ref, successCallback: (snap: unknown) => void) => {
      successCallback({
        id: 'a1',
        exists: () => true,
        data: () => ({
          sellerId: 'alice',
          status: 'REJECTED',
          reviewedAt,
          rejectionReason: 'blurry photos',
        }),
      })
      return vi.fn()
    })
    subscribeArtwork('a1', onData, vi.fn())
    expect(onData).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'REJECTED', reviewedAt, rejectionReason: 'blurry photos' }),
    )
  })

  it('defaults reviewedAt/rejectionReason to null when absent (e.g. a DRAFT/SUBMITTED artwork never reviewed)', () => {
    const onData = vi.fn()
    onSnapshot.mockImplementationOnce((_ref, successCallback: (snap: unknown) => void) => {
      successCallback({ id: 'a1', exists: () => true, data: () => ({ sellerId: 'alice', status: 'SUBMITTED' }) })
      return vi.fn()
    })
    subscribeArtwork('a1', onData, vi.fn())
    expect(onData).toHaveBeenCalledWith(expect.objectContaining({ reviewedAt: null, rejectionReason: null }))
  })
})

describe('subscribePublishedArtworks', () => {
  it('queries by sellerId and PUBLISHED status, and maps/sorts the results', () => {
    const older = Timestamp.fromMillis(1000)
    const newer = Timestamp.fromMillis(2000)
    const onData = vi.fn()

    onSnapshot.mockImplementationOnce((_query, successCallback: (snap: unknown) => void) => {
      successCallback({
        docs: [
          {
            id: 'old',
            data: () => ({
              sellerId: 'alice',
              title: 'Old',
              description: 'd',
              price: 100,
              category: 'painting',
              tags: [],
              images: [],
              inventoryCount: 1,
              status: 'PUBLISHED',
              createdAt: older,
              updatedAt: older,
            }),
          },
          {
            id: 'new',
            data: () => ({
              sellerId: 'alice',
              title: 'New',
              description: 'd',
              price: 200,
              category: 'painting',
              tags: [],
              images: [],
              inventoryCount: 1,
              status: 'PUBLISHED',
              createdAt: newer,
              updatedAt: newer,
            }),
          },
        ],
      })
      return vi.fn()
    })

    subscribePublishedArtworks('alice', onData, vi.fn())

    expect(where).toHaveBeenCalledWith('sellerId', '==', 'alice')
    expect(where).toHaveBeenCalledWith('status', '==', 'PUBLISHED')
    const artworks = onData.mock.calls[0][0]
    expect(artworks.map((a: { id: string }) => a.id)).toEqual(['new', 'old'])
  })

  it('filters out documents that fail to map (defensive against malformed data)', () => {
    const onData = vi.fn()
    onSnapshot.mockImplementationOnce((_query, successCallback: (snap: unknown) => void) => {
      successCallback({ docs: [{ id: 'bad', data: () => ({ status: 'NOT_REAL' }) }] })
      return vi.fn()
    })
    subscribePublishedArtworks('alice', onData, vi.fn())
    expect(onData).toHaveBeenCalledWith([])
  })
})

describe('subscribeSellerArtworks', () => {
  it('maps and sorts the seller’s own artworks by most-recently-updated first', () => {
    const older = Timestamp.fromMillis(1000)
    const newer = Timestamp.fromMillis(2000)
    const onData = vi.fn()

    onSnapshot.mockImplementationOnce((_query, successCallback: (snap: unknown) => void) => {
      successCallback({
        docs: [
          {
            id: 'old',
            data: () => ({
              sellerId: 'alice',
              title: 'Old',
              description: 'd',
              price: 100,
              category: 'painting',
              tags: [],
              images: [],
              inventoryCount: 1,
              status: 'DRAFT',
              createdAt: older,
              updatedAt: older,
            }),
          },
          {
            id: 'new',
            data: () => ({
              sellerId: 'alice',
              title: 'New',
              description: 'd',
              price: 200,
              category: 'painting',
              tags: [],
              images: [],
              inventoryCount: 1,
              status: 'DRAFT',
              createdAt: newer,
              updatedAt: newer,
            }),
          },
        ],
      })
      return vi.fn()
    })

    subscribeSellerArtworks('alice', onData, vi.fn())

    expect(onData).toHaveBeenCalledTimes(1)
    const artworks = onData.mock.calls[0][0]
    expect(artworks.map((a: { id: string }) => a.id)).toEqual(['new', 'old'])
  })

  it('filters out documents that fail to map (defensive against malformed data)', () => {
    const onData = vi.fn()
    onSnapshot.mockImplementationOnce((_query, successCallback: (snap: unknown) => void) => {
      successCallback({ docs: [{ id: 'bad', data: () => ({ status: 'NOT_REAL' }) }] })
      return vi.fn()
    })
    subscribeSellerArtworks('alice', onData, vi.fn())
    expect(onData).toHaveBeenCalledWith([])
  })
})

const EXISTING_IMAGE: ArtworkImage = {
  id: 'img1.jpg',
  path: 'artworks/alice/a1/img1.jpg',
  url: 'https://example.test/img1.jpg',
  order: 0,
  contentType: 'image/jpeg',
  size: 1024,
}

function fakeTransaction(docData: Record<string, unknown> | null) {
  return { get: vi.fn().mockResolvedValue({ exists: () => docData !== null, data: () => docData }), update: vi.fn() }
}

describe('mutateArtworkImages', () => {
  it('reads the current images fresh, applies the updater, and writes the result plus updatedAt', async () => {
    const transaction = fakeTransaction({ status: 'DRAFT', images: [EXISTING_IMAGE] })
    runTransaction.mockImplementationOnce(async (_db: unknown, callback: (tx: unknown) => unknown) => callback(transaction))

    const newImage = { ...EXISTING_IMAGE, id: 'img2.jpg', path: 'artworks/alice/a1/img2.jpg', order: 1 }
    const result = await mutateArtworkImages('a1', (current) => [...current, newImage])

    expect(result).toEqual([EXISTING_IMAGE, newImage])
    expect(transaction.update).toHaveBeenCalledWith(expect.anything(), {
      images: [EXISTING_IMAGE, newImage],
      updatedAt: 'SERVER_TIMESTAMP',
    })
  })

  it('drops malformed stored image entries before handing them to the updater', async () => {
    const transaction = fakeTransaction({ status: 'DRAFT', images: [{ id: 'bad' }] })
    runTransaction.mockImplementationOnce(async (_db: unknown, callback: (tx: unknown) => unknown) => callback(transaction))

    let seenByUpdater: unknown
    await mutateArtworkImages('a1', (current) => {
      seenByUpdater = current
      return current
    })

    expect(seenByUpdater).toEqual([])
  })

  it('throws a typed error without writing when the artwork no longer exists', async () => {
    const transaction = fakeTransaction(null)
    runTransaction.mockImplementationOnce(async (_db: unknown, callback: (tx: unknown) => unknown) => callback(transaction))

    await expect(mutateArtworkImages('a1', (current) => current)).rejects.toEqual({
      code: 'unknown',
      message: 'This artwork no longer exists.',
    })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  it('throws a typed error without writing when the artwork is no longer DRAFT', async () => {
    const transaction = fakeTransaction({ status: 'SUBMITTED', images: [] })
    runTransaction.mockImplementationOnce(async (_db: unknown, callback: (tx: unknown) => unknown) => callback(transaction))

    await expect(mutateArtworkImages('a1', (current) => current)).rejects.toEqual({
      code: 'permission-denied',
      message: 'This artwork can no longer be edited.',
    })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  it('maps a genuine Firestore error (e.g. a denied write) to a safe message', async () => {
    runTransaction.mockRejectedValueOnce(Object.assign(new Error('permission-denied'), { code: 'permission-denied' }))
    await expect(mutateArtworkImages('a1', (current) => current)).rejects.toEqual({
      code: 'permission-denied',
      message: 'You do not have permission to do that.',
    })
  })
})
