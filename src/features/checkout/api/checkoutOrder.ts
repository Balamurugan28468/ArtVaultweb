import { createClient } from '@/lib/supabase/client'
import { dataError } from '@/lib/supabase/data'
export interface CheckoutRequest { artworkIds: string[]; addressId: string; idempotencyKey: string }
export interface CheckoutReceipt { orderId: string; amount: number; currency: string; status: string; pricingState: string; reservationExpiresAt: number }
export class CheckoutRejectedError extends Error {
 readonly previousOrderExcluded: boolean
 constructor(message: string, previousOrderExcluded = false) {
  super(message)
  this.previousOrderExcluded = previousOrderExcluded
 }
}

// In create_checkout_order these checks run only AFTER the existing-key lookup.
// Receiving one proves there was no committed order for this request key.
const replayCheckedRejections = new Set([
 'Saved address not found', 'Cart not found', 'Artwork is unavailable for purchase',
 'Seller is unavailable', 'Selected artwork is not in your cart',
 'Insufficient inventory', 'Order total exceeds supported amount',
])

export async function createCheckoutOrder(input: CheckoutRequest): Promise<CheckoutReceipt> {
 const { data, error } = await createClient().rpc('create_checkout_order', {
  artwork_ids: input.artworkIds, address_id: input.addressId, idempotency_key: input.idempotencyKey,
 })
 // These responses prove the database rejected the transaction. Timeouts,
 // connection loss and unknown errors retain the key: an order may exist.
 if (error) {
  if (['22023', '42501', '22P02', 'PGRST301', 'PGRST302', 'PGRST303'].includes(error.code)) {
   throw new CheckoutRejectedError(error.code === '22023'
    ? error.message
    : error.code === '22P02' ? 'Review your cart and saved address before trying again.'
    : 'Sign in with a buyer account and select your own saved address.',
    ['22023', '42501'].includes(error.code) && replayCheckedRejections.has(error.message))
  }
  throw dataError(error)
 }
 if (!data || typeof data.orderId !== 'string' || !data.orderId ||
  !Number.isSafeInteger(data.amount) || data.amount < 0 || typeof data.currency !== 'string' ||
  typeof data.status !== 'string' || typeof data.pricingState !== 'string' ||
  !Number.isFinite(data.reservationExpiresAt)) {
  // A malformed response is not evidence that the transaction rolled back.
  throw dataError(null)
 }
 return data as CheckoutReceipt
}
