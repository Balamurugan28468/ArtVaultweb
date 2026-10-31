import { createClient } from '@/lib/supabase/client'
import {
  dataError,
  observe,
  result,
} from '@/lib/supabase/data'
import type { WishlistError } from '../types'

export const toWishlistError =
  dataError

export function subscribeWishlistIds(
  uid: string,
  onData: (
    ids: Set<string>,
  ) => void,
  onError: (
    error: WishlistError,
  ) => void,
) {
  return observe(
    'wishlist_items',
    `user_id=eq.${uid}`,
    async () => {
      const rows =
        (await result(
          createClient()
            .from(
              'wishlist_items',
            )
            .select(
              'artwork_id',
            )
            .eq(
              'user_id',
              uid,
            ),
        )) ?? []

      return new Set<string>(
        rows
          .map(
            (row) =>
              row.artwork_id,
          )
          .filter(
            (
              artworkId,
            ): artworkId is string =>
              typeof artworkId ===
              'string',
          ),
      )
    },
    onData,
    onError,
  )
}

export async function addWishlistItem(
  uid: string,
  artworkId: string,
): Promise<void> {
  const { error } =
    await createClient()
      .from(
        'wishlist_items',
      )
      .insert({
        user_id: uid,
        artwork_id: artworkId,
      })

  if (
    error &&
    error.code !== '23505'
  ) {
    throw dataError(error)
  }
}

export async function removeWishlistItem(
  uid: string,
  artworkId: string,
): Promise<void> {
  await result(
    createClient()
      .from(
        'wishlist_items',
      )
      .delete()
      .eq(
        'user_id',
        uid,
      )
      .eq(
        'artwork_id',
        artworkId,
      ),
  )
}