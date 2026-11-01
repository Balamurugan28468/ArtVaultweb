import { createClient } from '@/lib/supabase/client'
import { dataError, result } from '@/lib/supabase/data'
import { Timestamp, timestamp } from '@/lib/supabase/timestamp'
import type {
  ArtworkRatingSummary,
  ArtworkReview,
  CreateReviewInput,
  ReviewEligibility,
  UpdateReviewInput,
} from '../types'

export const toReviewError = dataError

function mapRowToReview(row: Record<string, unknown>, buyerName?: string): ArtworkReview {
  return {
    id: String(row.id),
    artworkId: String(row.artwork_id),
    buyerId: String(row.buyer_id),
    buyerName: buyerName || (typeof row.buyer_name === 'string' ? row.buyer_name : 'Verified Collector'),
    rating: Number(row.rating),
    title: String(row.title || ''),
    content: String(row.content || ''),
    createdAt: typeof row.created_at === 'string' ? timestamp(row.created_at) : Timestamp.now(),
    updatedAt: typeof row.updated_at === 'string' ? timestamp(row.updated_at) : Timestamp.now(),
  }
}

export async function fetchArtworkReviews(artworkId: string): Promise<ArtworkReview[]> {
  try {
    const client = createClient()
    const { data, error } = await client
      .from('artwork_reviews')
      .select('*, profiles:buyer_id(display_name)')
      .eq('artwork_id', artworkId)
      .order('created_at', { ascending: false })

    if (error) throw error
    if (!data) return []

    return data.map((row) => {
      const profile = row.profiles as { display_name?: string } | null
      return mapRowToReview(row, profile?.display_name || undefined)
    })
  } catch (err) {
    throw toReviewError(err)
  }
}

export async function fetchArtworkRatingSummary(artworkId: string): Promise<ArtworkRatingSummary> {
  const client = createClient()
  try {
    const { data, error } = await client.rpc('get_artwork_rating_summary', {
      target_artwork_id: artworkId,
    })

    if (!error && data && data.length > 0) {
      const row = data[0]
      return {
        averageRating: Number(row.average_rating) || 0,
        reviewCount: Number(row.review_count) || 0,
        ratingCounts: {
          1: Number(row.rating_1_count) || 0,
          2: Number(row.rating_2_count) || 0,
          3: Number(row.rating_3_count) || 0,
          4: Number(row.rating_4_count) || 0,
          5: Number(row.rating_5_count) || 0,
        },
      }
    }
  } catch {
    // Fall back to client calculation if RPC is not yet applied
  }

  try {
    const { data, error } = await client
      .from('artwork_reviews')
      .select('rating')
      .eq('artwork_id', artworkId)

    if (error || !data || data.length === 0) {
      return {
        averageRating: 0,
        reviewCount: 0,
        ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      }
    }

    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    let sum = 0
    for (const r of data) {
      const val = Math.min(Math.max(Number(r.rating) || 5, 1), 5) as 1 | 2 | 3 | 4 | 5
      counts[val]++
      sum += val
    }

    return {
      averageRating: Number((sum / data.length).toFixed(2)),
      reviewCount: data.length,
      ratingCounts: counts,
    }
  } catch {
    return {
      averageRating: 0,
      reviewCount: 0,
      ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    }
  }
}

export async function checkReviewEligibility(artworkId: string, sellerId?: string): Promise<ReviewEligibility> {
  const client = createClient()
  const { data: authData } = await client.auth.getUser()
  const user = authData?.user

  if (!user) {
    return { eligible: false, reason: 'NOT_LOGGED_IN' }
  }

  if (sellerId && sellerId === user.id) {
    return { eligible: false, reason: 'SELLER_OWN_ARTWORK' }
  }

  // Check if user already reviewed
  const { data: existing } = await client
    .from('artwork_reviews')
    .select('*')
    .eq('artwork_id', artworkId)
    .eq('buyer_id', user.id)
    .maybeSingle()

  if (existing) {
    return {
      eligible: false,
      reason: 'ALREADY_REVIEWED',
      existingReview: mapRowToReview(existing),
    }
  }

  // Check if user purchased the artwork in a completed order
  const { data: orderItem } = await client
    .from('order_items')
    .select('id, orders!inner(buyer_id, payment_state, status)')
    .eq('artwork_id', artworkId)
    .eq('orders.buyer_id', user.id)
    .limit(1)

  const hasPurchased = Boolean(orderItem && orderItem.length > 0)

  if (!hasPurchased) {
    return { eligible: false, reason: 'NOT_PURCHASED' }
  }

  return { eligible: true }
}

export async function createArtworkReview(input: CreateReviewInput): Promise<ArtworkReview> {
  const client = createClient()
  const { data: authData } = await client.auth.getUser()
  const user = authData?.user
  if (!user) throw new Error('You must be signed in to submit a review.')

  const row = await result(
    client
      .from('artwork_reviews')
      .insert({
        artwork_id: input.artworkId,
        buyer_id: user.id,
        rating: input.rating,
        title: input.title.trim(),
        content: input.content.trim(),
      })
      .select('*')
      .single(),
  )

  return mapRowToReview(row as Record<string, unknown>)
}

export async function updateArtworkReview(reviewId: string, input: UpdateReviewInput): Promise<ArtworkReview> {
  const client = createClient()
  const row = await result(
    client
      .from('artwork_reviews')
      .update({
        rating: input.rating,
        title: input.title.trim(),
        content: input.content.trim(),
      })
      .eq('id', reviewId)
      .select('*')
      .single(),
  )

  return mapRowToReview(row as Record<string, unknown>)
}

export async function deleteArtworkReview(reviewId: string): Promise<void> {
  const client = createClient()
  await result(client.from('artwork_reviews').delete().eq('id', reviewId))
}

export async function fetchUserReviews(): Promise<(ArtworkReview & { artworkTitle?: string })[]> {
  const client = createClient()
  const { data: authData } = await client.auth.getUser()
  const user = authData?.user
  if (!user) return []

  const { data, error } = await client
    .from('artwork_reviews')
    .select('*, artworks:artwork_id(title)')
    .eq('buyer_id', user.id)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return data.map((row) => {
    const artwork = row.artworks as { title?: string } | null
    return {
      ...mapRowToReview(row),
      artworkTitle: artwork?.title || 'Artwork',
    }
  })
}

