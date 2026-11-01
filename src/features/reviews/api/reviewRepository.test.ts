import { describe, expect, it, vi } from 'vitest'

const { createClient } = vi.hoisted(() => {
  const sampleRow = {
    id: 'rev-1',
    artwork_id: 'art-1',
    buyer_id: 'u1',
    rating: 5,
    title: 'Masterpiece',
    comment: 'Stunning colors in person',
    profiles: { display_name: 'Collector Bob' },
    created_at: '2026-11-01T12:00:00Z',
    updated_at: '2026-11-01T12:00:00Z',
  }

  const queryBuilder = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  }
  queryBuilder.select.mockReturnValue(queryBuilder)
  queryBuilder.eq.mockReturnValue(queryBuilder)
  queryBuilder.in.mockReturnValue(queryBuilder)
  queryBuilder.order.mockResolvedValue({ data: [sampleRow], error: null })
  queryBuilder.limit.mockReturnValue(queryBuilder)
  queryBuilder.insert.mockReturnValue(queryBuilder)
  queryBuilder.update.mockReturnValue(queryBuilder)
  queryBuilder.delete.mockReturnValue(queryBuilder)
  queryBuilder.single.mockReturnValue(queryBuilder)
  queryBuilder.maybeSingle.mockReturnValue(queryBuilder)

  return {
    createClient: vi.fn(() => ({
      from: vi.fn(() => queryBuilder),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    })),
    queryBuilder,
  }
})

vi.mock('@/lib/supabase/client', () => ({ createClient }))

const {
  fetchArtworkRatingSummary,
  fetchArtworkReviews,
  checkReviewEligibility,
} = await import('./reviewRepository')

describe('reviewRepository', () => {
  it('fetchArtworkRatingSummary returns default empty summary when RPC returns empty or fails', async () => {
    const summary = await fetchArtworkRatingSummary('art-1')
    expect(summary.averageRating).toBe(0)
    expect(summary.reviewCount).toBe(0)
    expect(summary.ratingCounts).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })
  })

  it('fetchArtworkReviews maps and returns reviews with timestamps', async () => {
    const reviews = await fetchArtworkReviews('art-1')
    expect(reviews).toHaveLength(1)
    expect(reviews[0].rating).toBe(5)
    expect(reviews[0].title).toBe('Masterpiece')
    expect(reviews[0].buyerName).toBe('Collector Bob')
  })

  it('checkReviewEligibility reports SELLER_OWN_ARTWORK when buyer is the artwork creator', async () => {
    const eligibility = await checkReviewEligibility('art-1', 'u1')
    expect(eligibility.eligible).toBe(false)
    expect(eligibility.reason).toBe('SELLER_OWN_ARTWORK')
  })
})
