import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { Timestamp } from '@/lib/supabase/timestamp'
import type {
  ArtworkImage,
} from '../types'

const mocks = vi.hoisted(() => {
  const builder: Record<
    string,
    unknown
  > = {}

  const select = vi.fn(
    () => builder,
  )

  const eq = vi.fn(
    () => builder,
  )

  const order = vi.fn(
    () => builder,
  )

  const maybeSingle =
    vi.fn(
      () => builder,
    )

  Object.assign(
    builder,
    {
      select,
      eq,
      order,
      maybeSingle,
    },
  )

  const from = vi.fn(
    () => builder,
  )

  const createClient =
    vi.fn(() => ({
      from,
    }))

  const result = vi.fn()
  const rpc = vi.fn()

  const signedImage =
    vi.fn()

  const requireIdentity =
    vi.fn()

  const observe =
    vi.fn()

  return {
    builder,
    select,
    eq,
    order,
    maybeSingle,

    from,
    createClient,

    result,
    rpc,
    signedImage,
    requireIdentity,
    observe,
  }
})

vi.mock(
  '@/lib/supabase/client',
  () => ({
    createClient:
      mocks.createClient,
  }),
)

vi.mock(
  '@/lib/supabase/data',
  async (
    importOriginal,
  ) => {
    const actual =
      await importOriginal<
        typeof import('@/lib/supabase/data')
      >()

    return {
      ...actual,

      result:
        mocks.result,

      rpc:
        mocks.rpc,

      signedImage:
        mocks.signedImage,

      requireIdentity:
        mocks.requireIdentity,

      observe:
        mocks.observe,
    }
  },
)

const {
  createArtworkDraft,
  deleteOwnedArtwork,
  getArtwork,
  getPublicArtwork,
  mapCatalogRow,
  mapToArtwork,
  mutateArtworkImages,
  removeArtworkFromSale,
  resubmitArtworkForReview,
  sellerArtworks,
  submitArtwork,
  subscribeArtwork,
  subscribePublishedArtworks,
  subscribeSellerArtworks,
  toArtworkError,
  updateArtworkDraft,
  updatePublishedArtworkSafeFields,
} = await import(
  './artworkRepository'
)

const INPUT = {
  title: 'Sunset',
  description:
    'A painting.',
  price: 1500,
  category: 'painting',
  tags: [
    'blue',
    'abstract',
  ],
  inventoryCount: 2,
}

function catalogRow(
  id = 'a1',
  overrides: Record<
    string,
    unknown
  > = {},
) {
  return {
    id,

    seller_id:
      'seller-1',

    title:
      'Sunset',

    description:
      'A painting.',

    price_minor:
      1500,

    category:
      'painting',

    tags: [
      'blue',
    ],

    images: [],

    physical_quantity:
      2,

    reserved_quantity:
      0,

    status:
      'PUBLISHED',

    reviewed_at:
      null,

    rejection_reason:
      null,

    like_count:
      5,

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
  mocks.order.mockClear()
  mocks.maybeSingle.mockClear()
  mocks.from.mockClear()
  mocks.createClient.mockClear()

  mocks.result.mockReset()

  mocks.rpc
    .mockReset()
    .mockResolvedValue(
      undefined,
    )

  mocks.signedImage
    .mockReset()
    .mockResolvedValue(
      'https://example.test/signed-image',
    )

  mocks.requireIdentity
    .mockReset()
    .mockResolvedValue(
      undefined,
    )

  mocks.observe.mockReset()
})

describe(
  'mapToArtwork',
  () => {
    it('maps a valid artwork', () => {
      const createdAt =
        Timestamp.fromMillis(
          1000,
        )

      const artwork =
        mapToArtwork(
          'a1',
          {
            sellerId:
              'seller-1',

            title:
              'Sunset',

            description:
              'A painting.',

            price:
              1500,

            category:
              'painting',

            tags: [
              'blue',
            ],

            images: [],

            inventoryCount:
              2,

            reservedCount:
              1,

            status:
              'PUBLISHED',

            reviewedAt:
              null,

            rejectionReason:
              null,

            likeCount:
              42,

            createdAt,

            updatedAt:
              createdAt,
          },
        )

      expect(
        artwork,
      ).toEqual(
        expect.objectContaining({
          id: 'a1',
          sellerId:
            'seller-1',
          status:
            'PUBLISHED',
          likeCount:
            42,
          reservedCount:
            1,
        }),
      )
    })

    it('returns null for an invalid status', () => {
      expect(
        mapToArtwork(
          'a1',
          {
            sellerId:
              'seller-1',

            status:
              'NOT_REAL',
          },
        ),
      ).toBeNull()
    })

    it('returns null when sellerId is missing', () => {
      expect(
        mapToArtwork(
          'a1',
          {
            status:
              'PUBLISHED',
          },
        ),
      ).toBeNull()
    })

    it('defaults optional numeric values safely', () => {
      const artwork =
        mapToArtwork(
          'a1',
          {
            sellerId:
              'seller-1',

            status:
              'DRAFT',
          },
        )

      expect(
        artwork,
      ).toEqual(
        expect.objectContaining({
          price: 0,
          inventoryCount:
            0,
          reservedCount:
            0,
          likeCount:
            0,
        }),
      )
    })
  },
)

describe(
  'mapCatalogRow',
  () => {
    it('maps Supabase column names into the application Artwork shape', async () => {
      const artwork =
        await mapCatalogRow(
          catalogRow(),
        )

      expect(
        artwork,
      ).toEqual(
        expect.objectContaining({
          id: 'a1',

          sellerId:
            'seller-1',

          price:
            1500,

          inventoryCount:
            2,

          reservedCount:
            0,

          likeCount:
            5,

          status:
            'PUBLISHED',
        }),
      )

      expect(
        artwork.createdAt,
      ).toBeInstanceOf(
        Timestamp,
      )
    })

    it('resolves artwork image paths through Supabase Storage', async () => {
      const artwork =
        await mapCatalogRow(
          catalogRow(
            'a1',
            {
              images: [
                {
                  id: 'img-1',

                  path:
                    'seller-1/a1/img-1',

                  contentType:
                    'image/jpeg',

                  order: 0,

                  size: 100,
                },
              ],
            },
          ),
        )

      expect(
        mocks.signedImage,
      ).toHaveBeenCalledWith(
        'seller-1/a1/img-1',
      )

      expect(
        artwork.images[0],
      ).toEqual({
        id: 'img-1',

        path:
          'seller-1/a1/img-1',

        url:
          'https://example.test/signed-image',

        order: 0,

        contentType:
          'image/jpeg',

        size: 100,
      })
    })
  },
)

describe(
  'sellerArtworks',
  () => {
    it('reads seller artworks from artwork_catalog', async () => {
      mocks.result.mockResolvedValueOnce([
        catalogRow(
          'a1',
        ),
      ])

      const artworks =
        await sellerArtworks(
          'seller-1',
        )

      expect(
        mocks.from,
      ).toHaveBeenCalledWith(
        'artwork_catalog',
      )

      expect(
        mocks.eq,
      ).toHaveBeenCalledWith(
        'seller_id',
        'seller-1',
      )

      expect(
        artworks.map(
          (artwork) =>
            artwork.id,
        ),
      ).toEqual([
        'a1',
      ])
    })

    it('adds the PUBLISHED filter when requested', async () => {
      mocks.result.mockResolvedValueOnce(
        [],
      )

      await sellerArtworks(
        'seller-1',
        true,
      )

      expect(
        mocks.eq,
      ).toHaveBeenCalledWith(
        'status',
        'PUBLISHED',
      )
    })
  },
)

describe(
  'getArtwork',
  () => {
    it('returns null when the catalog row does not exist', async () => {
      mocks.result.mockResolvedValueOnce(
        null,
      )

      await expect(
        getArtwork(
          'missing',
        ),
      ).resolves.toBeNull()
    })

    it('maps an existing artwork', async () => {
      mocks.result.mockResolvedValueOnce(
        catalogRow(
          'a1',
        ),
      )

      const artwork =
        await getArtwork(
          'a1',
        )

      expect(
        artwork?.id,
      ).toBe('a1')
    })
  },
)

describe(
  'getPublicArtwork',
  () => {
    it('requires PUBLISHED status', async () => {
      mocks.result.mockResolvedValueOnce(
        null,
      )

      await getPublicArtwork(
        'a1',
      )

      expect(
        mocks.eq,
      ).toHaveBeenCalledWith(
        'status',
        'PUBLISHED',
      )
    })
  },
)

describe(
  'createArtworkDraft',
  () => {
    it('verifies the seller identity and delegates creation to the protected RPC', async () => {
      mocks.rpc.mockResolvedValueOnce(
        'a1',
      )

      const id =
        await createArtworkDraft(
          'seller-1',
          INPUT,
        )

      expect(id).toBe(
        'a1',
      )

      expect(
        mocks.requireIdentity,
      ).toHaveBeenCalledWith(
        'seller-1',
      )

      expect(
        mocks.rpc,
      ).toHaveBeenCalledWith(
        'save_artwork',
        {
          target:
            null,

          operation:
            'CREATE',

          fields:
            INPUT,
        },
      )
    })
  },
)

describe(
  'artwork write RPCs',
  () => {
    it('updates a draft through save_artwork', async () => {
      await updateArtworkDraft(
        'a1',
        INPUT,
      )

      expect(
        mocks.rpc,
      ).toHaveBeenCalledWith(
        'save_artwork',
        {
          target:
            'a1',

          operation:
            'EDIT',

          fields:
            INPUT,
        },
      )
    })

    it('submits an artwork through save_artwork', async () => {
      await submitArtwork(
        'a1',
      )

      expect(
        mocks.rpc,
      ).toHaveBeenCalledWith(
        'save_artwork',
        {
          target:
            'a1',

          operation:
            'SUBMIT',
        },
      )
    })

    it('updates published safe fields through save_artwork', async () => {
      const fields = {
        price:
          2000,

        inventoryCount:
          3,

        tags: [
          'updated',
        ],
      }

      await updatePublishedArtworkSafeFields(
        'a1',
        fields,
      )

      expect(
        mocks.rpc,
      ).toHaveBeenCalledWith(
        'save_artwork',
        {
          target:
            'a1',

          operation:
            'SAFE_EDIT',

          fields,
        },
      )
    })

    it('resubmits artwork content through resubmit_artwork', async () => {
      const images: ArtworkImage[] =
        [
          {
            id:
              'img-1',

            path:
              'seller-1/a1/img-1',

            url:
              'https://example.test/image',

            order:
              0,

            contentType:
              'image/jpeg',

            size:
              100,
          },
        ]

      await resubmitArtworkForReview(
        'a1',
        INPUT,
        images,
      )

      expect(
        mocks.rpc,
      ).toHaveBeenCalledWith(
        'resubmit_artwork',
        {
          target:
            'a1',

          fields:
            INPUT,

          images: [
            {
              id:
                'img-1',
            },
          ],
        },
      )
    })

    it('deletes an owned artwork using the protected RPC', async () => {
      await deleteOwnedArtwork(
        'a1',
      )

      expect(
        mocks.rpc,
      ).toHaveBeenCalledWith(
        'save_artwork',
        {
          target:
            'a1',

          operation:
            'DELETE',
        },
      )
    })

    it('removes an artwork from sale using the protected RPC', async () => {
      await removeArtworkFromSale(
        'a1',
      )

      expect(
        mocks.rpc,
      ).toHaveBeenCalledWith(
        'save_artwork',
        {
          target:
            'a1',

          operation:
            'REMOVE',
        },
      )
    })
  },
)

describe(
  'subscriptions',
  () => {
    it('subscribes to seller artwork changes through Supabase Realtime', () => {
      const unsubscribe =
        vi.fn()

      mocks.observe.mockReturnValueOnce(
        unsubscribe,
      )

      const returned =
        subscribeSellerArtworks(
          'seller-1',
          vi.fn(),
          vi.fn(),
        )

      expect(
        mocks.observe,
      ).toHaveBeenCalledWith(
        'artworks',

        'seller_id=eq.seller-1',

        expect.any(
          Function,
        ),

        expect.any(
          Function,
        ),

        expect.any(
          Function,
        ),
      )

      expect(
        returned,
      ).toBe(
        unsubscribe,
      )
    })

    it('subscribes to published seller artwork changes', () => {
      const unsubscribe =
        vi.fn()

      mocks.observe.mockReturnValueOnce(
        unsubscribe,
      )

      const returned =
        subscribePublishedArtworks(
          'seller-1',
          vi.fn(),
          vi.fn(),
        )

      expect(
        returned,
      ).toBe(
        unsubscribe,
      )
    })

    it('subscribes to both artwork and inventory changes for one artwork', () => {
      const stopArtwork =
        vi.fn()

      const stopInventory =
        vi.fn()

      mocks.observe
        .mockReturnValueOnce(
          stopArtwork,
        )
        .mockReturnValueOnce(
          stopInventory,
        )

      const stop =
        subscribeArtwork(
          'a1',
          vi.fn(),
          vi.fn(),
        )

      expect(
        mocks.observe,
      ).toHaveBeenCalledTimes(
        2,
      )

      stop()

      expect(
        stopArtwork,
      ).toHaveBeenCalledTimes(
        1,
      )

      expect(
        stopInventory,
      ).toHaveBeenCalledTimes(
        1,
      )
    })
  },
)

describe(
  'mutateArtworkImages',
  () => {
    it('reads the current artwork, applies the updater and calls update_artwork_images', async () => {
      mocks.result.mockResolvedValueOnce(
        catalogRow(
          'a1',
        ),
      )

      const image: ArtworkImage = {
        id:
          'img-1',

        path:
          'seller-1/a1/img-1',

        url:
          'https://example.test/image',

        order:
          0,

        contentType:
          'image/jpeg',

        size:
          100,
      }

      const result =
        await mutateArtworkImages(
          'a1',

          () => [
            image,
          ],
        )

      expect(
        result,
      ).toEqual([
        image,
      ])

      expect(
        mocks.rpc,
      ).toHaveBeenCalledWith(
        'update_artwork_images',
        {
          target:
            'a1',

          images: [
            {
              id:
                'img-1',
            },
          ],
        },
      )
    })

    it('fails safely when the artwork no longer exists', async () => {
      mocks.result.mockResolvedValueOnce(
        null,
      )

      await expect(
        mutateArtworkImages(
          'missing',

          (
            current,
          ) =>
            current,
        ),
      ).rejects.toEqual({
        code:
          'unknown',

        message:
          'Something went wrong. Please try again.',
      })

      expect(
        mocks.rpc,
      ).not.toHaveBeenCalled()
    })
  },
)

describe(
  'toArtworkError',
  () => {
    it('maps a Supabase RLS denial', () => {
      expect(
        toArtworkError({
          code:
            '42501',
        }),
      ).toEqual({
        code:
          'permission-denied',

        message:
          'You do not have permission to do that.',
      })
    })

    it('maps network failures', () => {
      expect(
        toArtworkError(
          new TypeError(
            'offline',
          ),
        ),
      ).toEqual({
        code:
          'network',

        message:
          'Network unavailable. Check your connection and try again.',
      })
    })

    it('falls back to an unknown safe error', () => {
      expect(
        toArtworkError(
          new Error(
            'boom',
          ),
        ),
      ).toEqual({
        code:
          'unknown',

        message:
          'Something went wrong. Please try again.',
      })
    })
  },
)