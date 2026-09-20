import { createClient } from '@/lib/supabase/client'
import {
  dataError,
  observe,
  requireIdentity,
  result,
} from '@/lib/supabase/data'
import {
  CART_MAX_QUANTITY,
  type CartError,
} from '../types'

export const toCartError = dataError

export function clampCartQuantity(
  quantity: number,
): number {
  if (!Number.isFinite(quantity)) {
    return 1
  }

  return Math.min(
    CART_MAX_QUANTITY,
    Math.max(
      1,
      Math.trunc(quantity),
    ),
  )
}

async function cartId(
  uid: string,
  create = false,
): Promise<string | null> {
  await requireIdentity(uid)

  const client =
    createClient()

  let cart = await result(
    client
      .from('carts')
      .select('id')
      .eq('user_id', uid)
      .maybeSingle(),
  )

  if (!cart && create) {
    const inserted = await client
      .from('carts')
      .insert({
        user_id: uid,
      })
      .select('id')
      .single()

    if (
      inserted.error?.code === '23505'
    ) {
      cart = await result(
        client
          .from('carts')
          .select('id')
          .eq('user_id', uid)
          .single(),
      )
    } else {
      if (inserted.error) {
        throw dataError(
          inserted.error,
        )
      }

      cart =
        inserted.data
    }
  }

  if (
    !cart ||
    typeof cart.id !== 'string'
  ) {
    return null
  }

  return cart.id
}

export function subscribeCartQuantities(
  uid: string,
  onData: (
    items: Map<string, number>,
  ) => void,
  onError: (
    error: CartError,
  ) => void,
) {
  return observe(
    'cart_items',
    undefined,
    async () => {
      const id =
        await cartId(uid)

      if (!id) {
        return new Map<
          string,
          number
        >()
      }

      const rows =
        (await result(
          createClient()
            .from('cart_items')
            .select(
              'artwork_id,quantity',
            )
            .eq(
              'cart_id',
              id,
            ),
        )) ?? []

      return new Map<
        string,
        number
      >(
        rows.map(
          (row) => {
            const quantity = Number(row.quantity)
            return [
              String(row.artwork_id),
              Number.isFinite(quantity) && quantity >= 1
                ? clampCartQuantity(quantity)
                : 1,
            ] as const
          },
        ),
      )
    },
    onData,
    onError,
  )
}

export async function createCartItem(
  uid: string,
  artworkId: string,
  quantity: number,
): Promise<void> {
  const id =
    await cartId(
      uid,
      true,
    )

  if (!id) {
    throw dataError(null)
  }

  await result(
    createClient()
      .from('cart_items')
      .insert({
        cart_id: id,
        artwork_id: artworkId,
        quantity:
          clampCartQuantity(
            quantity,
          ),
      }),
  )
}

export async function updateCartItemQuantity(
  uid: string,
  artworkId: string,
  quantity: number,
): Promise<void> {
  const id =
    await cartId(uid)

  if (!id) {
    throw dataError(null)
  }

  const rows =
    (await result(
      createClient()
        .from('cart_items')
        .update({
          quantity:
            clampCartQuantity(
              quantity,
            ),
        })
        .eq(
          'cart_id',
          id,
        )
        .eq(
          'artwork_id',
          artworkId,
        )
        .select('id'),
    )) ?? []

  if (rows.length !== 1) {
    throw dataError(null)
  }
}

export async function removeCartItem(
  uid: string,
  artworkId: string,
): Promise<void> {
  const id =
    await cartId(uid)

  if (!id) {
    return
  }

  await result(
    createClient()
      .from('cart_items')
      .delete()
      .eq(
        'cart_id',
        id,
      )
      .eq(
        'artwork_id',
        artworkId,
      ),
  )
}
