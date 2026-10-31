import { useEffect, useState } from 'react'
import { getOrderShipments, type Shipment } from '../api/fulfillmentRepository'

export function OrderShipments({ orderId, test }: { orderId: string; test: boolean }) {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [error, setError] = useState(false)
  useEffect(() => {
    if (test) return
    let active = true
    void getOrderShipments(orderId).then(data => { if (active) setShipments(data) }, () => { if (active) setError(true) })
    return () => { active = false }
  }, [orderId, test])
  if (test) return <p className="text-sm text-accent-gold">TEST order — no real shipment.</p>
  if (error) return <p role="alert">Tracking could not be loaded. Refresh this page to retry.</p>
  return <div className="flex flex-col gap-2 text-sm">
    <p>Manual tracking — seller-entered information, not a courier feed.</p>
    {shipments.length === 0 ? <p>Not available yet</p> : shipments.map((s, index) => <div key={index} className="break-words">
      <p>{s.status === 'PENDING' ? 'PROCESSING' : s.status}</p>
      {s.carrier && <p>{s.carrier} · {s.trackingNumber}</p>}
      {s.shippedAt && <p>Shipped: {new Date(s.shippedAt).toLocaleString()}</p>}
      {s.deliveredAt && <p>Delivery recorded: {new Date(s.deliveredAt).toLocaleString()}</p>}
    </div>)}
  </div>
}
