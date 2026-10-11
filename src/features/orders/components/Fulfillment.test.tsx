import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
const { getSellerFulfillment, advanceFulfillment, getOrderShipments } = vi.hoisted(() => ({getSellerFulfillment:vi.fn(),advanceFulfillment:vi.fn(),getOrderShipments:vi.fn()}))
vi.mock('../api/fulfillmentRepository', () => ({getSellerFulfillment,advanceFulfillment,getOrderShipments}))
import { SellerOrders } from './SellerOrders'
import { OrderShipments } from './OrderShipments'
const order = {orderId:'order',createdAt:'2026-10-11T00:00:00Z',orderStatus:'PAID',test:false,canFulfill:true,shipment:null,address:null,items:[{id:'item',title:'Snapshot artwork',quantity:1,subtotal:550000}]}
beforeEach(() => {vi.resetAllMocks(); getSellerFulfillment.mockResolvedValue([order]); advanceFulfillment.mockResolvedValue(undefined); getOrderShipments.mockResolvedValue([])})
it('renders TEST evidence with no fulfillment controls', async () => {
  getSellerFulfillment.mockResolvedValue([{...order,test:true,canFulfill:false}])
  render(<SellerOrders />)
  expect(await screen.findByText(/Read-only payment evidence/)).toBeInTheDocument()
  expect(screen.queryByText('Start processing')).not.toBeInTheDocument()
  expect(screen.queryByText('Record shipment')).not.toBeInTheDocument()
  expect(advanceFulfillment).not.toHaveBeenCalled()
})
it('processes through the RPC then refreshes stored state', async () => {
  render(<SellerOrders />); fireEvent.click(await screen.findByText('Start processing'))
  await waitFor(() => expect(advanceFulfillment).toHaveBeenCalledWith('order','PROCESS','',''))
  await waitFor(() => expect(getSellerFulfillment).toHaveBeenCalledTimes(2))
})
it('requires carrier/tracking input and submits only the owned order action', async () => {
  getSellerFulfillment.mockResolvedValue([{...order,shipment:{status:'PENDING'}}])
  render(<SellerOrders />)
  const carrier=await screen.findByLabelText('Carrier name'), tracking=screen.getByLabelText('Tracking number')
  expect(carrier).toBeRequired(); expect(tracking).toBeRequired()
  fireEvent.change(carrier,{target:{value:'Carrier'}}); fireEvent.change(tracking,{target:{value:'ABC-123'}})
  fireEvent.click(screen.getByText('Record shipment'))
  await waitFor(() => expect(advanceFulfillment).toHaveBeenCalledWith('order','SHIP','Carrier','ABC-123'))
})
it('shows server rejection without claiming shipment success', async () => {
  advanceFulfillment.mockRejectedValue(new Error('denied'))
  render(<SellerOrders />); fireEvent.click(await screen.findByText('Start processing'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not update fulfillment')
})
it('recovers a list failure via refresh', async () => {
  getSellerFulfillment.mockRejectedValueOnce(new Error('offline'))
  render(<SellerOrders />); await screen.findByRole('alert'); fireEvent.click(screen.getByText('Refresh orders'))
  expect(await screen.findByText(/Snapshot artwork/)).toBeInTheDocument()
})
it('TEST buyer shipment view never starts a shipment request', () => {
  render(<OrderShipments orderId="order" test />)
  expect(screen.getByText('TEST order — no real shipment.')).toBeInTheDocument()
  expect(getOrderShipments).not.toHaveBeenCalled()
})
it('buyer sees stored manual tracking and no invented delivery date', async () => {
  getOrderShipments.mockResolvedValue([{status:'SHIPPED',carrier:'Carrier',trackingNumber:'ABC',shippedAt:'2026-10-11T00:00:00Z',deliveredAt:null}])
  render(<OrderShipments orderId="order" test={false} />)
  expect(await screen.findByText('Carrier · ABC')).toBeInTheDocument()
  expect(screen.queryByText(/Delivery recorded/)).not.toBeInTheDocument()
})
