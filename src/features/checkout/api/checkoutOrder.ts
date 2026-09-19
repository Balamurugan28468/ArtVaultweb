import { rpc } from '@/lib/supabase/data'
export interface CheckoutRequest { artworkIds: string[]; addressId: string; idempotencyKey: string }
export interface CheckoutReceipt { orderId: string; amount: number; currency: string; status: string; pricingState: string; reservationExpiresAt: number }
export async function createCheckoutOrder(input: CheckoutRequest): Promise<CheckoutReceipt> {
 return rpc<CheckoutReceipt>('create_checkout_order',{artwork_ids:input.artworkIds,address_id:input.addressId,idempotency_key:input.idempotencyKey})
}
