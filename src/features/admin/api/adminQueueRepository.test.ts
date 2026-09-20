import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient, from, result: supabaseResult } = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  const from = vi.fn(() => builder)
  return {
    createClient: vi.fn(() => ({ from })),
    from,
    result: vi.fn(),
  }
})

vi.mock('@/lib/supabase/client', () => ({ createClient }))
vi.mock('@/lib/supabase/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/data')>()),
  result: supabaseResult,
}))

const { getPendingSellerApplications, getSubmittedArtworks } = await import('./adminQueueRepository')

function fakeSnapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return docs.map((document) => ({ id: document.id, ...document.data }))
}

const now = '2026-09-19T10:00:00.000Z'

beforeEach(() => {
  supabaseResult.mockReset()
  from.mockClear()
})

describe('getPendingSellerApplications', () => {
  it('queries sellers where status == PENDING and maps + sorts oldest-applied-first', async () => {
    supabaseResult.mockResolvedValueOnce(
      fakeSnapshot([
        {
          id: 'alice',
          data: {
            status: 'PENDING',
            business_name: 'Alice Art',
            description: 'd',
            contact_email: 'alice@example.com',
            reviewed_at: null,
            created_at: now,
            updated_at: now,
          },
        },
        {
          id: 'bob',
          data: {
            status: 'PENDING',
            business_name: 'Bob Art',
            description: 'd',
            contact_email: 'bob@example.com',
            reviewed_at: null,
            created_at: '2026-09-19T10:00:10.000Z',
            updated_at: '2026-09-19T10:00:10.000Z',
          },
        },
      ]),
    )

    const result = await getPendingSellerApplications()

    expect(from).toHaveBeenCalledWith('seller_profiles')
    expect(result.map((a) => a.uid)).toEqual(['alice', 'bob'])
  })

  it('drops a malformed document rather than crashing', async () => {
    supabaseResult.mockResolvedValueOnce(fakeSnapshot([{ id: 'ghost', data: { status: 'not-a-real-status' } }]))
    const result = await getPendingSellerApplications()
    expect(result).toEqual([])
  })

  it('translates an RLS error into a safe SellerError', async () => {
    supabaseResult.mockRejectedValueOnce({ code: '42501' })
    await expect(getPendingSellerApplications()).rejects.toMatchObject({ code: 'permission-denied' })
  })
})

describe('getSubmittedArtworks', () => {
  it('queries artworks where status == SUBMITTED and maps + sorts oldest-updated-first', async () => {
    supabaseResult.mockResolvedValueOnce(
      fakeSnapshot([
        {
          id: 'a2',
          data: {
            seller_id: 'alice',
            status: 'SUBMITTED',
            title: 'Newer',
            description: 'd',
            price_minor: 1000,
            category: 'painting',
            tags: [],
            images: [],
            physical_quantity: 1,
            reserved_quantity: 0,
            reviewed_at: null,
            rejection_reason: null,
            like_count: 0,
            created_at: now,
            updated_at: '2026-09-19T10:00:10.000Z',
          },
        },
        {
          id: 'a1',
          data: {
            seller_id: 'alice',
            status: 'SUBMITTED',
            title: 'Older',
            description: 'd',
            price_minor: 1000,
            category: 'painting',
            tags: [],
            images: [],
            physical_quantity: 1,
            reserved_quantity: 0,
            reviewed_at: null,
            rejection_reason: null,
            like_count: 0,
            created_at: now,
            updated_at: now,
          },
        },
      ]),
    )

    const result = await getSubmittedArtworks()

    expect(from).toHaveBeenCalledWith('artwork_catalog')
    expect(result.map((a) => a.id)).toEqual(['a2', 'a1'])
  })

  it('drops a malformed document rather than crashing', async () => {
    supabaseResult.mockResolvedValueOnce(fakeSnapshot([{ id: 'ghost', data: { status: 'not-a-real-status' } }]))
    const result = await getSubmittedArtworks()
    expect(result).toEqual([])
  })

  it('translates an RLS error into a safe ArtworkError', async () => {
    supabaseResult.mockRejectedValueOnce({ code: '42501' })
    await expect(getSubmittedArtworks()).rejects.toMatchObject({ code: 'permission-denied' })
  })
})
