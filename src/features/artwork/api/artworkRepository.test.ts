import { Timestamp } from 'firebase/firestore'
import { describe, expect, it, vi } from 'vitest'

const { addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where, serverTimestamp } = vi.hoisted(() => ({
  addDoc: vi.fn(),
  collection: vi.fn(() => ({ path: 'artworks' })),
  deleteDoc: vi.fn(),
  doc: vi.fn(() => ({ path: 'artworks/a1' })),
  onSnapshot: vi.fn(),
  query: vi.fn((...args: unknown[]) => ({ args })),
  updateDoc: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}))

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return { ...actual, addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where, serverTimestamp }
})
vi.mock('@/lib/firebase/config', () => ({ db: {} }))

const {
  createArtworkDraft,
  deleteArtworkDraft,
  subscribeArtwork,
  subscribeSellerArtworks,
  submitArtwork,
  toArtworkError,
  updateArtworkDraft,
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

describe('deleteArtworkDraft', () => {
  it('deletes the document', async () => {
    deleteDoc.mockResolvedValueOnce(undefined)
    await deleteArtworkDraft('a1')
    expect(deleteDoc).toHaveBeenCalledTimes(1)
  })

  it('throws a typed ArtworkError when denied (e.g. attempting to delete a SUBMITTED artwork)', async () => {
    deleteDoc.mockRejectedValueOnce({ code: 'permission-denied' })
    await expect(deleteArtworkDraft('a1')).rejects.toEqual({
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
