import { createClient } from '@/lib/supabase/client'
import { result, signedImage } from '@/lib/supabase/data'

export interface Shipment {
  status: string
  carrier: string | null
  trackingNumber: string | null
  shippedAt: string | null
  deliveredAt: string | null
}
export interface SellerOrder {
  orderId: string
  createdAt: string
  orderStatus: string
  test: boolean
  canFulfill: boolean
  shipment: Shipment | null
  address: { fullName: string; line1: string; line2: string | null; city: string; state: string; postalCode: string; country: string; phone: string | null } | null
  items: { id: string; title: string; quantity: number; subtotal: number; imagePath: string | null; imageUrl?: string | null }[]
}
export type FulfillmentAction = 'PROCESS' | 'SHIP' | 'DELIVER'

export async function getSellerFulfillment(): Promise<SellerOrder[]> {
  const orders: SellerOrder[] = await result(createClient().rpc('get_seller_fulfillment_orders')) ?? []
  return Promise.all(orders.map(async order => ({ ...order, items: await Promise.all(order.items.map(async item => ({
    ...item, imageUrl: item.imagePath ? await signedImage(item.imagePath).catch(() => null) : null,
  }))) })))
}
export async function advanceFulfillment(orderId: string, action: FulfillmentAction, carrier?: string, tracking?: string): Promise<void> {
  await result(createClient().rpc('advance_seller_fulfillment', {
    target: orderId, action, carrier_name: carrier?.trim() ?? null, tracking_code: tracking?.trim() ?? null,
  }))
}
export async function getOrderShipments(orderId: string): Promise<Shipment[]> {
  const rows = await result(createClient().from('shipments').select('status,carrier,tracking_number,shipped_at,delivered_at').eq('order_id', orderId).order('created_at')) ?? []
  return rows.map(row => ({ status: row.status, carrier: row.carrier, trackingNumber: row.tracking_number, shippedAt: row.shipped_at, deliveredAt: row.delivered_at }))
}
