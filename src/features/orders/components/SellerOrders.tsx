import { useEffect, useRef, useState } from 'react'
import { Button, Card } from '@/shared/ui'
import { advanceFulfillment, getSellerFulfillment, type FulfillmentAction, type SellerOrder } from '../api/fulfillmentRepository'

function SellerOrderCard({ order, reload }: { order: SellerOrder; reload: () => void }) {
  const [carrier, setCarrier] = useState('')
  const [tracking, setTracking] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const act = async (action: FulfillmentAction) => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError('')
    try { await advanceFulfillment(order.orderId, action, carrier, tracking); reload() }
    catch { setError('Could not update fulfillment. Refresh to check its stored state before retrying.') }
    finally { pending.current = false; setBusy(false) }
  }
  return <Card className="flex min-w-0 flex-col gap-3 p-4">
    <h3 className="break-all font-medium">Order #{order.orderId.slice(0, 8)}</h3>
    <p className="text-sm">{new Date(order.createdAt).toLocaleDateString()} · {order.orderStatus}</p>
    {order.test && <p className="text-accent-gold">TEST — no real fulfillment. Read-only payment evidence.</p>}
    <ul>{order.items.map(item => <li key={item.id} className="flex gap-3 py-2">
      {item.imageUrl && <img src={item.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />}
      <span className="min-w-0 break-words">{item.title}<br />Qty {item.quantity} · ₹{item.subtotal / 100}</span>
    </li>)}</ul>
    {order.address && <address className="break-words text-sm not-italic">
      {order.address.fullName}<br />{order.address.line1} {order.address.line2}<br />
      {order.address.city}, {order.address.state} {order.address.postalCode}<br />{order.address.country}<br />{order.address.phone}
    </address>}
    {order.shipment && <p className="break-words text-sm">Manual fulfillment: {order.shipment.status === 'PENDING' ? 'PROCESSING' : order.shipment.status}
      {order.shipment.carrier && <> · {order.shipment.carrier} · {order.shipment.trackingNumber}</>}
      {order.shipment.shippedAt && <> · Shipped {new Date(order.shipment.shippedAt).toLocaleString()}</>}
      {order.shipment.deliveredAt && <> · Delivery recorded {new Date(order.shipment.deliveredAt).toLocaleString()}</>}
    </p>}
    {!order.test && order.canFulfill && <>
      {!order.shipment && <Button disabled={busy} onClick={() => void act('PROCESS')}>Start processing</Button>}
      {order.shipment?.status === 'PENDING' && <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); void act('SHIP') }}>
        <label className="flex flex-col gap-1">Carrier name<input className="min-w-0 rounded border p-2" required minLength={2} maxLength={100} value={carrier} onChange={e => setCarrier(e.target.value)} /></label>
        <label className="flex flex-col gap-1">Tracking number<input className="min-w-0 rounded border p-2" required minLength={2} maxLength={100} pattern="[A-Za-z0-9][A-Za-z0-9 ._/\-]*" value={tracking} onChange={e => setTracking(e.target.value)} /></label>
        <Button type="submit" disabled={busy}>Record shipment</Button>
      </form>}
      {order.shipment?.status === 'SHIPPED' && <Button disabled={busy} onClick={() => void act('DELIVER')}>Confirm delivery manually</Button>}
    </>}
    {!order.test && !order.canFulfill && <p>Fulfillment unavailable pending payment review.</p>}
    {error && <p role="alert">{error}</p>}
  </Card>
}
export function SellerOrders() {
  const [orders, setOrders] = useState<SellerOrder[] | null>(null)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    void getSellerFulfillment().then(data => { if (active) { setOrders(data); setError(false) } }, () => { if (active) setError(true) })
    return () => { active = false }
  }, [revision])
  return <section className="flex flex-col gap-3" aria-label="Seller orders">
    <h2 className="font-display text-xl">Incoming paid orders</h2>
    <p className="text-sm text-text-muted">Manual fulfillment only. Tracking is seller-entered, not a courier feed. TEST orders cannot be dispatched.</p>
    <Button variant="secondary" onClick={() => setRevision(n => n + 1)}>Refresh orders</Button>
    {error ? <p role="alert">Could not load seller orders. Use Refresh orders to retry.</p> : orders === null ? <p role="status">Loading orders…</p> : orders.length === 0 ? <p>No paid orders yet.</p> :
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">{orders.map(order => <SellerOrderCard key={`${revision}-${order.orderId}`} order={order} reload={() => setRevision(n => n + 1)} />)}</div>}
  </section>
}
