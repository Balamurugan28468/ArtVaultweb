import { beforeEach, expect, it, vi } from 'vitest'
const { rpc, result, signedImage, builder } = vi.hoisted(() => {
  const builder = { select: vi.fn(), eq: vi.fn(), order: vi.fn() }
  for (const fn of Object.values(builder)) fn.mockReturnValue(builder)
  return { rpc: vi.fn(), result: vi.fn(), signedImage: vi.fn(), builder }
})
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc, from: () => builder }) }))
vi.mock('@/lib/supabase/data', () => ({ result, signedImage }))
import { advanceFulfillment, getOrderShipments, getSellerFulfillment } from './fulfillmentRepository'
beforeEach(() => vi.clearAllMocks())
it('uses the protected seller projection and signs the immutable image path', async () => {
  result.mockResolvedValue([{ orderId: 'order', items: [{ imagePath: 'seller/art/image' }] }])
  signedImage.mockResolvedValue('https://example.test/signed')
  expect((await getSellerFulfillment())[0].items[0].imageUrl).toBe('https://example.test/signed')
  expect(rpc).toHaveBeenCalledWith('get_seller_fulfillment_orders')
  expect(signedImage).toHaveBeenCalledWith('seller/art/image')
})
it('sends no seller identity, payment or inventory authority from the browser', async () => {
  result.mockResolvedValue('SHIPPED')
  await advanceFulfillment('order','SHIP',' Carrier ',' ABC ')
  expect(rpc).toHaveBeenCalledWith('advance_seller_fulfillment',{target:'order',action:'SHIP',carrier_name:'Carrier',tracking_code:'ABC'})
})
it('does not hide a rejected transition', async () => {
  result.mockRejectedValue(new Error('denied'))
  await expect(advanceFulfillment('order','PROCESS')).rejects.toThrow('denied')
})
it('maps scoped buyer shipment facts without fabricated tracking', async () => {
  result.mockResolvedValue([{status:'SHIPPED',carrier:'Carrier',tracking_number:'ABC',shipped_at:'2026-10-11T00:00:00Z',delivered_at:null}])
  expect(await getOrderShipments('order')).toEqual([{status:'SHIPPED',carrier:'Carrier',trackingNumber:'ABC',shippedAt:'2026-10-11T00:00:00Z',deliveredAt:null}])
  expect(builder.eq).toHaveBeenCalledWith('order_id','order')
})
