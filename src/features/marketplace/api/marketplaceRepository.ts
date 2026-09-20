import {
  ARTWORK_CATEGORIES,
  type Artwork,
  type ArtworkCategory,
} from '@/features/artwork'
import { mapCatalogRow } from '@/features/artwork/api/artworkRepository'
import { createClient } from '@/lib/supabase/client'
import { result } from '@/lib/supabase/data'
import type {
  MarketplaceCursor,
  MarketplaceFilters,
  MarketplacePage,
} from '../types'

export const MARKETPLACE_PAGE_SIZE = 12

export async function fetchMarketplacePage(
  filters: MarketplaceFilters,
  cursor: MarketplaceCursor | null,
): Promise<MarketplacePage> {
  const sort =
    (
      filters.minPrice !== null ||
      filters.maxPrice !== null
    ) &&
    filters.sort === 'newest'
      ? 'price-asc'
      : filters.sort

  const field =
    sort === 'newest'
      ? 'created_at'
      : 'price_minor'

  const ascending =
    sort === 'price-asc'

  const operator =
    ascending
      ? 'gt'
      : 'lt'

  let query = createClient()
    .from('artwork_catalog')
    .select('*')
    .eq(
      'status',
      'PUBLISHED',
    )

  if (filters.category) {
    query = query.eq(
      'category',
      filters.category,
    )
  }

  if (
    filters.minPrice !== null
  ) {
    query = query.gte(
      'price_minor',
      filters.minPrice,
    )
  }

  if (
    filters.maxPrice !== null
  ) {
    query = query.lte(
      'price_minor',
      filters.maxPrice,
    )
  }

  if (cursor) {
    if (
      !/^[0-9a-f-]{36}$/i.test(
        cursor.id,
      )
    ) {
      throw new Error(
        'Invalid marketplace cursor',
      )
    }

    const value =
      typeof cursor.primary ===
      'number'
        ? cursor.primary
        : cursor.primary
            .toDate()
            .toISOString()

    query = query.or(
      `${field}.${operator}.${value},and(${field}.eq.${value},id.${operator}.${cursor.id})`,
    )
  }

  const rows =
    (await result(
      query
        .order(
          field,
          {
            ascending,
          },
        )
        .order(
          'id',
          {
            ascending,
          },
        )
        .limit(
          MARKETPLACE_PAGE_SIZE,
        ),
    )) ?? []

  const artworks =
    await Promise.all(
      rows.map(
        (row) =>
          mapCatalogRow(
            row as Record<
              string,
              unknown
            >,
          ),
      ),
    )

  const last =
    artworks.at(-1)

  let nextCursor:
    | MarketplaceCursor
    | null = null

  if (
    rows.length ===
      MARKETPLACE_PAGE_SIZE &&
    last
  ) {
    nextCursor = {
      primary:
        sort === 'newest'
          ? (last.createdAt as MarketplaceCursor['primary'])
          : last.price,
      id: last.id,
    }
  }

  return {
    artworks,
    nextCursor,
  }
}

export async function fetchTrendingArtworks(): Promise<
  Artwork[]
> {
  const rows =
    (await result(
      createClient()
        .from(
          'artwork_catalog',
        )
        .select('*')
        .eq(
          'status',
          'PUBLISHED',
        )
        .order(
          'like_count',
          {
            ascending: false,
          },
        )
        .order('id')
        .limit(12),
    )) ?? []

  return Promise.all(
    rows.map(
      (row) =>
        mapCatalogRow(
          row as Record<
            string,
            unknown
          >,
        ),
    ),
  )
}

export async function fetchCategoryArtworkCounts(): Promise<{
  total: number
  byCategory: Record<
    ArtworkCategory,
    number
  >
}> {
  const counts =
    await Promise.all(
      ARTWORK_CATEGORIES.map(
        async (
          category,
        ) => {
          const {
            count,
            error,
          } =
            await createClient()
              .from(
                'artwork_catalog',
              )
              .select(
                'id',
                {
                  head: true,
                  count:
                    'exact',
                },
              )
              .eq(
                'status',
                'PUBLISHED',
              )
              .eq(
                'category',
                category,
              )

          if (error) {
            throw error
          }

          return [
            category,
            count ?? 0,
          ] as const
        },
      ),
    )

  return {
    total:
      counts.reduce(
        (
          total,
          [, count],
        ) =>
          total + count,
        0,
      ),

    byCategory:
      Object.fromEntries(
        counts,
      ) as Record<
        ArtworkCategory,
        number
      >,
  }
}