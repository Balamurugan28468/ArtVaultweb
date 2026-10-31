import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Timestamp } from '@/lib/supabase/timestamp'
import type {
  MarketplaceCursor,
  MarketplaceFilters,
} from '../types'

const mocks = vi.hoisted(() => {
  const state = {
    countResponse: {
      count: 0 as number | null,
      error: null as unknown,
    },
  }

  const builder: Record<string, unknown> = {}

  const select = vi.fn(() => builder)
  const eq = vi.fn(() => builder)
  const gte = vi.fn(() => builder)
  const lte = vi.fn(() => builder)
  const or = vi.fn<(filter: string) => typeof builder>(
    () => builder,
  )
  const order = vi.fn(() => builder)
  const limit = vi.fn(() => builder)

  Object.assign(builder, {
    select,
    eq,
    gte,
    lte,
    or,
    order,
    limit,

    then: (
      resolve: (value: {
        count: number | null
        error: unknown
      }) => unknown,
      reject?: (error: unknown) => unknown,
    ) =>
      Promise.resolve(state.countResponse).then(
        resolve,
        reject,
      ),
  })

  const from = vi.fn(() => builder)

  const createClient = vi.fn(() => ({
    from,
  }))

  const result = vi.fn()

  return {
    state,
    builder,
    select,
    eq,
    gte,
    lte,
    or,
    order,
    limit,
    from,
    createClient,
    result,
  }
})

vi.mock('@/lib/supabase/client', () => ({
  createClient: mocks.createClient,
}))

vi.mock(
  '@/lib/supabase/data',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/lib/supabase/data')
      >()

    return {
      ...actual,
      result: mocks.result,
    }
  },
)

const {
  fetchCategoryArtworkCounts,
  fetchMarketplacePage,
  fetchTrendingArtworks,
  MARKETPLACE_PAGE_SIZE,
} = await import(
  './marketplaceRepository'
)

const BASE_FILTERS: MarketplaceFilters = {
  category: null,
  minPrice: null,
  maxPrice: null,
  sort: 'newest',
}

function catalogRow(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    seller_id: 'seller-1',

    title: 'Sunset',
    description: 'A painting.',

    price_minor: 500,

    category: 'painting',
    tags: [],

    images: [],

    physical_quantity: 1,
    reserved_quantity: 0,

    status: 'PUBLISHED',

    reviewed_at: null,
    rejection_reason: null,

    like_count: 0,

    created_at:
      '2026-09-19T10:00:00.000Z',

    updated_at:
      '2026-09-19T10:00:00.000Z',

    ...overrides,
  }
}

beforeEach(() => {
  mocks.select.mockClear()
  mocks.eq.mockClear()
  mocks.gte.mockClear()
  mocks.lte.mockClear()
  mocks.or.mockClear()
  mocks.order.mockClear()
  mocks.limit.mockClear()
  mocks.from.mockClear()
  mocks.createClient.mockClear()

  mocks.result.mockReset()

  mocks.state.countResponse = {
    count: 0,
    error: null,
  }
})

describe('fetchMarketplacePage', () => {
  it('always filters marketplace rows to PUBLISHED', async () => {
    mocks.result.mockResolvedValueOnce([])

    await fetchMarketplacePage(
      BASE_FILTERS,
      null,
    )

    expect(
      mocks.eq,
    ).toHaveBeenCalledWith(
      'status',
      'PUBLISHED',
    )
  })

  it('adds the selected category filter', async () => {
    mocks.result.mockResolvedValueOnce([])

    await fetchMarketplacePage(
      {
        ...BASE_FILTERS,
        category: 'sculpture',
      },
      null,
    )

    expect(
      mocks.eq,
    ).toHaveBeenCalledWith(
      'category',
      'sculpture',
    )
  })

  it('does not add a category filter when category is null', async () => {
    mocks.result.mockResolvedValueOnce([])

    await fetchMarketplacePage(
      BASE_FILTERS,
      null,
    )

    expect(
      mocks.eq,
    ).not.toHaveBeenCalledWith(
      'category',
      expect.anything(),
    )
  })

  it('orders newest artworks by created_at descending', async () => {
    mocks.result.mockResolvedValueOnce([])

    await fetchMarketplacePage(
      {
        ...BASE_FILTERS,
        sort: 'newest',
      },
      null,
    )

    expect(
      mocks.order,
    ).toHaveBeenCalledWith(
      'created_at',
      {
        ascending: false,
      },
    )

    expect(
      mocks.order,
    ).toHaveBeenCalledWith(
      'id',
      {
        ascending: false,
      },
    )
  })

  it('orders price-asc by price_minor ascending', async () => {
    mocks.result.mockResolvedValueOnce([])

    await fetchMarketplacePage(
      {
        ...BASE_FILTERS,
        sort: 'price-asc',
      },
      null,
    )

    expect(
      mocks.order,
    ).toHaveBeenCalledWith(
      'price_minor',
      {
        ascending: true,
      },
    )
  })

  it('orders price-desc by price_minor descending', async () => {
    mocks.result.mockResolvedValueOnce([])

    await fetchMarketplacePage(
      {
        ...BASE_FILTERS,
        sort: 'price-desc',
      },
      null,
    )

    expect(
      mocks.order,
    ).toHaveBeenCalledWith(
      'price_minor',
      {
        ascending: false,
      },
    )
  })

  it('adds minimum and maximum price filters', async () => {
    mocks.result.mockResolvedValueOnce([])

    await fetchMarketplacePage(
      {
        ...BASE_FILTERS,
        minPrice: 100,
        maxPrice: 900,
      },
      null,
    )

    expect(
      mocks.gte,
    ).toHaveBeenCalledWith(
      'price_minor',
      100,
    )

    expect(
      mocks.lte,
    ).toHaveBeenCalledWith(
      'price_minor',
      900,
    )
  })

  it('uses price-asc when newest is combined with a price range', async () => {
    mocks.result.mockResolvedValueOnce([])

    await fetchMarketplacePage(
      {
        ...BASE_FILTERS,
        sort: 'newest',
        minPrice: 100,
      },
      null,
    )

    expect(
      mocks.order,
    ).toHaveBeenCalledWith(
      'price_minor',
      {
        ascending: true,
      },
    )
  })

  it('applies a Supabase cursor filter', async () => {
    mocks.result.mockResolvedValueOnce([])

    const cursor: MarketplaceCursor = {
      primary:
        Timestamp.fromMillis(
          Date.parse(
            '2026-09-19T10:00:00.000Z',
          ),
        ) as MarketplaceCursor['primary'],

      id: '11111111-1111-4111-8111-111111111111',
    }

    await fetchMarketplacePage(
      BASE_FILTERS,
      cursor,
    )

    expect(
      mocks.or,
    ).toHaveBeenCalledTimes(1)

    expect(
      mocks.or.mock.calls[0][0],
    ).toContain('created_at')
  })

  it('rejects a malformed cursor id', async () => {
    const cursor = {
      primary:
        Timestamp.now() as MarketplaceCursor['primary'],

      id: 'not-a-uuid',
    }

    await expect(
      fetchMarketplacePage(
        BASE_FILTERS,
        cursor,
      ),
    ).rejects.toThrow(
      'Invalid marketplace cursor',
    )
  })

  it('maps Supabase catalog rows into Artworks', async () => {
    mocks.result.mockResolvedValueOnce([
      catalogRow('a1'),
    ])

    const page =
      await fetchMarketplacePage(
        BASE_FILTERS,
        null,
      )

    expect(
      page.artworks,
    ).toHaveLength(1)

    expect(
      page.artworks[0],
    ).toEqual(
      expect.objectContaining({
        id: 'a1',
        sellerId: 'seller-1',
        status: 'PUBLISHED',
        price: 500,
      }),
    )
  })

  it('returns null cursor when fewer than one page is returned', async () => {
    mocks.result.mockResolvedValueOnce([
      catalogRow('a1'),
    ])

    const page =
      await fetchMarketplacePage(
        BASE_FILTERS,
        null,
      )

    expect(
      page.nextCursor,
    ).toBeNull()
  })

  it('returns a next cursor for a full page', async () => {
    mocks.result.mockResolvedValueOnce(
      Array.from(
        {
          length:
            MARKETPLACE_PAGE_SIZE,
        },
        (_, index) =>
          catalogRow(
            `00000000-0000-4000-8000-${String(
              index,
            ).padStart(12, '0')}`,
            {
              created_at:
                new Date(
                  Date.parse(
                    '2026-09-19T10:00:00.000Z',
                  ) +
                    index *
                      1000,
                ).toISOString(),
            },
          ),
      ),
    )

    const page =
      await fetchMarketplacePage(
        BASE_FILTERS,
        null,
      )

    expect(
      page.nextCursor,
    ).not.toBeNull()

    expect(
      page.nextCursor?.id,
    ).toBe(
      `00000000-0000-4000-8000-${String(
        MARKETPLACE_PAGE_SIZE -
          1,
      ).padStart(12, '0')}`,
    )
  })

  it('propagates a typed read failure', async () => {
    mocks.result.mockRejectedValueOnce({
      code: 'permission-denied',
      message:
        'You do not have permission to do that.',
    })

    await expect(
      fetchMarketplacePage(
        BASE_FILTERS,
        null,
      ),
    ).rejects.toMatchObject({
      code: 'permission-denied',
    })
  })
})

describe('fetchTrendingArtworks', () => {
  it('queries only PUBLISHED artworks', async () => {
    mocks.result.mockResolvedValueOnce([])

    await fetchTrendingArtworks()

    expect(
      mocks.eq,
    ).toHaveBeenCalledWith(
      'status',
      'PUBLISHED',
    )
  })

  it('orders using like_count descending', async () => {
    mocks.result.mockResolvedValueOnce([])

    await fetchTrendingArtworks()

    expect(
      mocks.order,
    ).toHaveBeenCalledWith(
      'like_count',
      {
        ascending: false,
      },
    )
  })

  it('maps actual Supabase-style rows', async () => {
    mocks.result.mockResolvedValueOnce([
      catalogRow('a1', {
        like_count: 42,
      }),
    ])

    const artworks =
      await fetchTrendingArtworks()

    expect(artworks).toEqual([
      expect.objectContaining({
        id: 'a1',
        likeCount: 42,
      }),
    ])
  })

  it('propagates read failures', async () => {
    mocks.result.mockRejectedValueOnce({
      code: 'network',
      message:
        'Network unavailable. Check your connection and try again.',
    })

    await expect(
      fetchTrendingArtworks(),
    ).rejects.toMatchObject({
      code: 'network',
    })
  })
})

describe('fetchCategoryArtworkCounts', () => {
  it('queries each supported category as PUBLISHED', async () => {
    mocks.state.countResponse = {
      count: 3,
      error: null,
    }

    const counts =
      await fetchCategoryArtworkCounts()

    expect(counts.byCategory).toEqual({
      painting: 3,
      sculpture: 3,
      photography: 3,
      digital: 3,
      other: 3,
    })

    expect(
      counts.total,
    ).toBe(15)

    expect(
      mocks.from,
    ).toHaveBeenCalledTimes(5)

    expect(
      mocks.eq,
    ).toHaveBeenCalledWith(
      'status',
      'PUBLISHED',
    )
  })

  it('treats a null count as zero', async () => {
    mocks.state.countResponse = {
      count: null,
      error: null,
    }

    const counts =
      await fetchCategoryArtworkCounts()

    expect(
      counts.total,
    ).toBe(0)
  })

  it('throws when Supabase returns a count error', async () => {
    mocks.state.countResponse = {
      count: null,
      error: {
        code: '42501',
      },
    }

    await expect(
      fetchCategoryArtworkCounts(),
    ).rejects.toEqual({
      code: '42501',
    })
  })
})