import { Timestamp } from 'firebase/firestore'
import { describe, expect, it, vi } from 'vitest'

const { collection, getDocs, query, where } = vi.hoisted(() => ({
  collection: vi.fn((_db: unknown, name: string) => ({ path: name })),
  getDocs: vi.fn(),
  query: vi.fn((...args: unknown[]) => ({ args })),
  where: vi.fn((...args: unknown[]) => ({ args })),
}))

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return { ...actual, collection, getDocs, query, where }
})
vi.mock('@/lib/firebase/config', () => ({ db: {} }))

const { getPendingSellerApplications, getSubmittedArtworks } = await import('./adminQueueRepository')

function fakeSnapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })) }
}

const now = Timestamp.now()

describe('getPendingSellerApplications', () => {
  it('queries sellers where status == PENDING and maps + sorts oldest-applied-first', async () => {
    getDocs.mockResolvedValueOnce(
      fakeSnapshot([
        {
          id: 'bob',
          data: {
            uid: 'bob',
            status: 'PENDING',
            businessName: 'Bob Art',
            description: 'd',
            contactEmail: 'bob@example.com',
            appliedAt: new Timestamp(now.seconds + 10, 0),
            reviewedAt: null,
            createdAt: now,
            updatedAt: now,
          },
        },
        {
          id: 'alice',
          data: {
            uid: 'alice',
            status: 'PENDING',
            businessName: 'Alice Art',
            description: 'd',
            contactEmail: 'alice@example.com',
            appliedAt: now,
            reviewedAt: null,
            createdAt: now,
            updatedAt: now,
          },
        },
      ]),
    )

    const result = await getPendingSellerApplications()

    expect(where).toHaveBeenCalledWith('status', '==', 'PENDING')
    expect(result.map((a) => a.uid)).toEqual(['alice', 'bob'])
  })

  it('drops a malformed document rather than crashing', async () => {
    getDocs.mockResolvedValueOnce(fakeSnapshot([{ id: 'ghost', data: { status: 'not-a-real-status' } }]))
    const result = await getPendingSellerApplications()
    expect(result).toEqual([])
  })

  it('translates a raw Firestore error into a safe SellerError', async () => {
    getDocs.mockRejectedValueOnce({ code: 'permission-denied' })
    await expect(getPendingSellerApplications()).rejects.toMatchObject({ code: 'permission-denied' })
  })
})

describe('getSubmittedArtworks', () => {
  it('queries artworks where status == SUBMITTED and maps + sorts oldest-updated-first', async () => {
    getDocs.mockResolvedValueOnce(
      fakeSnapshot([
        {
          id: 'a2',
          data: {
            sellerId: 'alice',
            status: 'SUBMITTED',
            title: 'Newer',
            description: 'd',
            price: 1000,
            category: 'painting',
            tags: [],
            images: [],
            inventoryCount: 1,
            reviewedAt: null,
            rejectionReason: null,
            likeCount: 0,
            createdAt: now,
            updatedAt: new Timestamp(now.seconds + 10, 0),
          },
        },
        {
          id: 'a1',
          data: {
            sellerId: 'alice',
            status: 'SUBMITTED',
            title: 'Older',
            description: 'd',
            price: 1000,
            category: 'painting',
            tags: [],
            images: [],
            inventoryCount: 1,
            reviewedAt: null,
            rejectionReason: null,
            likeCount: 0,
            createdAt: now,
            updatedAt: now,
          },
        },
      ]),
    )

    const result = await getSubmittedArtworks()

    expect(where).toHaveBeenCalledWith('status', '==', 'SUBMITTED')
    expect(result.map((a) => a.id)).toEqual(['a1', 'a2'])
  })

  it('drops a malformed document rather than crashing', async () => {
    getDocs.mockResolvedValueOnce(fakeSnapshot([{ id: 'ghost', data: { status: 'not-a-real-status' } }]))
    const result = await getSubmittedArtworks()
    expect(result).toEqual([])
  })

  it('translates a raw Firestore error into a safe ArtworkError', async () => {
    getDocs.mockRejectedValueOnce({ code: 'permission-denied' })
    await expect(getSubmittedArtworks()).rejects.toMatchObject({ code: 'permission-denied' })
  })
})
