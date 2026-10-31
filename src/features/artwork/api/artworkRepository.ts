import { createClient } from '@/lib/supabase/client'
import {
  dataError,
  observe,
  requireIdentity,
  result,
  rpc,
  signedImage,
} from '@/lib/supabase/data'
import {
  Timestamp,
  timestamp,
} from '@/lib/supabase/timestamp'
import {
  isArtworkCategory,
  isArtworkImageContentType,
  isArtworkStatus,
  type Artwork,
  type ArtworkDraftInput,
  type ArtworkError,
  type ArtworkImage,
} from '../types'

export const toArtworkError = dataError

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function numberOrZero(value: unknown): number {
  const number =
    typeof value === 'number'
      ? value
      : Number(value)

  return Number.isFinite(number)
    ? number
    : 0
}

export function mapToArtwork(
  id: string,
  data: Record<string, unknown>,
): Artwork | null {
  if (
    typeof data.sellerId !== 'string' ||
    !isArtworkStatus(data.status)
  ) {
    return null
  }

  const images: ArtworkImage[] =
    Array.isArray(data.images)
      ? data.images.filter(
          (
            value,
          ): value is ArtworkImage => {
            if (!isRecord(value)) {
              return false
            }

            return (
              typeof value.id === 'string' &&
              typeof value.path === 'string' &&
              typeof value.url === 'string' &&
              isArtworkImageContentType(
                value.contentType,
              ) &&
              typeof value.size === 'number' &&
              typeof value.order === 'number'
            )
          },
        )
      : []

  return {
    id,
    sellerId: data.sellerId,

    title:
      typeof data.title === 'string'
        ? data.title
        : '',

    description:
      typeof data.description === 'string'
        ? data.description
        : '',

    price:
      typeof data.price === 'number'
        ? data.price
        : 0,

    category: isArtworkCategory(data.category)
      ? data.category
      : 'other',

    tags: Array.isArray(data.tags)
      ? data.tags.filter(
          (tag): tag is string =>
            typeof tag === 'string',
        )
      : [],

    images,

    inventoryCount:
      typeof data.inventoryCount === 'number'
        ? data.inventoryCount
        : 0,

    reservedCount:
      typeof data.reservedCount === 'number'
        ? data.reservedCount
        : 0,

    status: data.status,

    reviewedAt:
      data.reviewedAt instanceof Timestamp
        ? data.reviewedAt
        : null,

    rejectionReason:
      typeof data.rejectionReason === 'string'
        ? data.rejectionReason
        : null,

    likeCount:
      typeof data.likeCount === 'number'
        ? data.likeCount
        : 0,

    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt
        : Timestamp.now(),

    updatedAt:
      data.updatedAt instanceof Timestamp
        ? data.updatedAt
        : Timestamp.now(),
  }
}

export async function mapCatalogRow(
  row: Record<string, unknown>,
): Promise<Artwork> {
  const rawImages = Array.isArray(row.images)
    ? row.images.filter(isRecord)
    : []

  const images: ArtworkImage[] = []

  for (const image of rawImages) {
    const id =
      typeof image.id === 'string'
        ? image.id
        : null

    const path =
      typeof image.path === 'string'
        ? image.path
        : null

    const contentType =
      image.contentType ??
      image.content_type

    const order =
      numberOrZero(
        image.order ??
          image.sort_order,
      )

    const size =
      numberOrZero(
        image.size ??
          image.size_bytes,
      )

    if (
      !id ||
      !path ||
      !isArtworkImageContentType(
        contentType,
      )
    ) {
      continue
    }

    images.push({
      id,
      path,
      url: await signedImage(path),
      order,
      contentType,
      size,
    })
  }

  const mapped = mapToArtwork(
    String(row.id),
    {
      ...row,

      sellerId:
        typeof row.seller_id === 'string'
          ? row.seller_id
          : '',

      price: numberOrZero(
        row.price_minor,
      ),

      inventoryCount: numberOrZero(
        row.physical_quantity,
      ),

      reservedCount: numberOrZero(
        row.reserved_quantity,
      ),

      likeCount: numberOrZero(
        row.like_count,
      ),

      images,

      reviewedAt: row.reviewed_at
        ? timestamp(row.reviewed_at)
        : null,

      rejectionReason:
        row.rejection_reason,

      createdAt: timestamp(
        row.created_at,
      ),

      updatedAt: timestamp(
        row.updated_at,
      ),
    },
  )

  if (!mapped) {
    throw dataError(null)
  }

  return mapped
}

export async function sellerArtworks(
  sellerId: string,
  published = false,
): Promise<Artwork[]> {
  let query = createClient()
    .from('artwork_catalog')
    .select('*')
    .eq('seller_id', sellerId)
    .order('updated_at', {
      ascending: false,
    })

  if (published) {
    query = query.eq(
      'status',
      'PUBLISHED',
    )
  }

  const rows =
    (await result(query)) ?? []

  return Promise.all(
    rows.map((row) =>
      mapCatalogRow(
        row as Record<string, unknown>,
      ),
    ),
  )
}

export function subscribeSellerArtworks(
  sellerId: string,
  onData: (artworks: Artwork[]) => void,
  onError: (error: ArtworkError) => void,
) {
  return observe(
    'artworks',
    `seller_id=eq.${sellerId}`,
    () => sellerArtworks(sellerId),
    onData,
    onError,
  )
}

export function subscribePublishedArtworks(
  sellerId: string,
  onData: (artworks: Artwork[]) => void,
  onError: (error: ArtworkError) => void,
) {
  return observe(
    'artworks',
    `seller_id=eq.${sellerId}`,
    () =>
      sellerArtworks(
        sellerId,
        true,
      ),
    onData,
    onError,
  )
}

export async function getArtwork(
  id: string,
): Promise<Artwork | null> {
  const row = await result(
    createClient()
      .from('artwork_catalog')
      .select('*')
      .eq('id', id)
      .maybeSingle(),
  )

  if (!row) {
    return null
  }

  return mapCatalogRow(
    row as Record<string, unknown>,
  )
}

export async function getPublicArtwork(
  id: string,
): Promise<Artwork | null> {
  const row = await result(
    createClient()
      .from('artwork_catalog')
      .select('*')
      .eq('id', id)
      .eq('status', 'PUBLISHED')
      .maybeSingle(),
  )

  if (!row) {
    return null
  }

  return mapCatalogRow(
    row as Record<string, unknown>,
  )
}

export function subscribeArtwork(
  id: string,
  onData: (artwork: Artwork | null) => void,
  onError: (error: ArtworkError) => void,
) {
  const read = () =>
    getArtwork(id)

  const stopArtwork = observe(
    'artworks',
    `id=eq.${id}`,
    read,
    onData,
    onError,
  )

  const stopInventory = observe(
    'inventory',
    `artwork_id=eq.${id}`,
    read,
    onData,
    onError,
  )

  return () => {
    stopArtwork()
    stopInventory()
  }
}

export async function createArtworkDraft(
  sellerId: string,
  input: ArtworkDraftInput,
): Promise<string> {
  await requireIdentity(sellerId)

  return rpc<string>(
    'save_artwork',
    {
      target: null,
      operation: 'CREATE',
      fields: input,
    },
  )
}

export async function updateArtworkDraft(
  id: string,
  input: ArtworkDraftInput,
): Promise<void> {
  await rpc(
    'save_artwork',
    {
      target: id,
      operation: 'EDIT',
      fields: input,
    },
  )
}

export async function submitArtwork(
  id: string,
): Promise<void> {
  await rpc(
    'save_artwork',
    {
      target: id,
      operation: 'SUBMIT',
    },
  )
}

export interface ArtworkSafeFieldsInput {
  price: number
  inventoryCount: number
  tags: string[]
}

export async function updatePublishedArtworkSafeFields(
  id: string,
  input: ArtworkSafeFieldsInput,
): Promise<void> {
  await rpc(
    'save_artwork',
    {
      target: id,
      operation: 'SAFE_EDIT',
      fields: input,
    },
  )
}

export async function resubmitArtworkForReview(
  id: string,
  input: ArtworkDraftInput,
  images: ArtworkImage[],
): Promise<void> {
  await rpc(
    'resubmit_artwork',
    {
      target: id,
      fields: input,
      images: images.map(
        (image) => ({
          id: image.id,
        }),
      ),
    },
  )
}

export async function deleteOwnedArtwork(
  id: string,
): Promise<void> {
  await rpc(
    'save_artwork',
    {
      target: id,
      operation: 'DELETE',
    },
  )
}

export async function removeArtworkFromSale(
  id: string,
): Promise<void> {
  await rpc(
    'save_artwork',
    {
      target: id,
      operation: 'REMOVE',
    },
  )
}

export async function mutateArtworkImages(
  id: string,
  updater: (
    images: ArtworkImage[],
  ) => ArtworkImage[],
): Promise<ArtworkImage[]> {
  const current =
    await getArtwork(id)

  if (!current) {
    throw dataError(null)
  }

  const next =
    updater(current.images)

  await rpc(
    'update_artwork_images',
    {
      target: id,
      images: next.map(
        (image) => ({
          id: image.id,
        }),
      ),
    },
  )

  return next
}