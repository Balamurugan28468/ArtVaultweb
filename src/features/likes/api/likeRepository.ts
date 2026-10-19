import { createClient } from '@/lib/supabase/client'
import {
  dataError,
  result,
  rpc,
} from '@/lib/supabase/data'

export const toLikeError = dataError

function normalizeLikeCount(
  value: unknown,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return 0
  }

  return Math.trunc(value)
}

export async function hasLiked(
  artworkId: string,
  uid: string,
): Promise<boolean> {
  const row = await result(
    createClient()
      .from('likes')
      .select('id')
      .eq(
        'artwork_id',
        artworkId,
      )
      .eq(
        'user_id',
        uid,
      )
      .maybeSingle(),
  )

  return row !== null
}

export async function likeArtwork(
  artworkId: string,
  uid: string,
): Promise<void> {
  const { error } =
    await createClient()
      .from('likes')
      .insert({
        artwork_id:
          artworkId,

        user_id:
          uid,
      })

  // PostgreSQL unique-violation.
  //
  // Liking something that is already liked is treated as
  // idempotent rather than as a user-facing failure.
  if (
    error &&
    error.code !== '23505'
  ) {
    throw dataError(error)
  }
}

export async function unlikeArtwork(
  artworkId: string,
  uid: string,
): Promise<void> {
  await result(
    createClient()
      .from('likes')
      .delete()
      .eq(
        'artwork_id',
        artworkId,
      )
      .eq(
        'user_id',
        uid,
      ),
  )
}

export interface AuthoritativeLikeState {
  liked: boolean
  likeCount: number
}

/**
 * Reconciles the caller's personal liked state with the
 * authoritative artwork like count stored/calculated by
 * PostgreSQL.
 *
 * The browser never calculates an authoritative count by
 * itself. The count comes from the protected database RPC.
 */
export async function getAuthoritativeLikeState(
  artworkId: string,
  uid: string,
): Promise<AuthoritativeLikeState> {
  const [
    liked,
    rawLikeCount,
  ] = await Promise.all([
    hasLiked(
      artworkId,
      uid,
    ),

    rpc<unknown>(
      'artwork_like_count',
      {
        target:
          artworkId,
      },
    ),
  ])

  return {
    liked,

    likeCount:
      normalizeLikeCount(
        rawLikeCount,
      ),
  }
}