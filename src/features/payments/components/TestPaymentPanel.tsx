import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { env } from '@/config/env'
import type { Order } from '@/features/orders/types'
import { Button } from '@/shared/ui'
import { loadRazorpay, openTestCheckout, reconcileTestPayment, startTestPayment, testPaymentsAvailable, verifyTestPayment, type PaymentResult } from '../api/razorpay'

export function TestPaymentPanel({ order, onConfirmed }: { order: Order; onConfirmed(): void }) {
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const active = useRef(false)
  const close = useRef<(() => void) | undefined>(undefined)
  const working = useRef(false)
  const [now, setNow] = useState(Date.now)
  const deadline = order.reservationExpiresAt?.toMillis()
  const expired = order.reservationStatus === 'RELEASED' || order.cancellationReason === 'RESERVATION_EXPIRED'
    || (deadline !== undefined && deadline <= now)
  const eligible = order.reservationStatus === 'ACTIVE' && deadline !== undefined && Number.isFinite(deadline) && !expired
  useEffect(() => {
    // Display guard only: PostgreSQL still authorizes against its own clock.
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    active.current = true
    if (env.VITE_ENABLE_RAZORPAY_TEST) void testPaymentsAvailable().then(value => { if (active.current) setReady(value) })
    return () => { active.current = false; close.current?.(); close.current = undefined }
  }, [])
  const showResult = (result: PaymentResult) => {
    if (!active.current) return
    setMessage(result === 'SUCCEEDED' ? 'Test payment verified by the server. Refreshing the stored order.'
      : result === 'REVIEW' ? 'Payment needs reconciliation. Do not pay again; contact ArtVault support.'
      : result === 'FAILED' ? 'The provider reports a failed attempt. You may retry while the reservation is active.'
      : 'Payment is still pending verification. Check its status before retrying.')
    if (result === 'SUCCEEDED') onConfirmed()
  }
  const fail = (error: unknown) => { if (active.current) setMessage(error instanceof Error ? error.message : 'Payment status is unavailable. Check before retrying.') }
  const finish = () => { working.current = false; if (active.current) setBusy(false) }
  const check = async () => {
    if (working.current) return
    working.current = true; setBusy(true)
    try { showResult(await reconcileTestPayment(order.id)) } catch (error) { fail(error) } finally { finish() }
  }
  const pay = async () => {
    if (working.current || !eligible || deadline === undefined || deadline <= Date.now()) return
    working.current = true; setBusy(true); setMessage('Opening Razorpay Test Checkout…')
    try {
      await loadRazorpay()
      if (!active.current) { finish(); return }
      if (deadline <= Date.now()) { setNow(Date.now()); finish(); return }
      const session = await startTestPayment(order.id)
      if (!active.current) { finish(); return }
      let verifying = false
      close.current = openTestCheckout(session, {
        result: result => {
          if (verifying || !active.current) return
          verifying = true
          setMessage('Verifying payment on the server…')
          void verifyTestPayment(session.paymentId, result).then(showResult).catch(fail).finally(finish)
        },
        dismiss: () => {
          if (verifying) return
          if (active.current) setMessage('Checkout closed. No payment success was assumed. Check the stored status before retrying.')
          finish()
        },
        failed: () => {
          if (active.current && !verifying) setMessage('The payment attempt failed. Retry in Razorpay or close checkout to check its status.')
        },
      })
    } catch (error) { fail(error); finish() }
  }
  if (order.paymentMode === 'TEST' && order.paymentState === 'PAID') return <div className="text-sm text-accent-gold">
    <p>Razorpay TEST payment — no real money or fulfillment.</p>
    {order.paymentReference && <p className="break-all">Payment reference: {order.paymentReference}</p>}
  </div>
  if (expired && order.paymentState === 'PENDING') return <div className="flex flex-col gap-2 text-sm" role="status">
    <p>The payment window expired. This order cannot start a new payment.</p>
    {order.reservationStatus === 'RELEASED'
      ? <Link to="/explore" className="underline">Return to marketplace for a new checkout</Link>
      : <p>Wait for the trusted expiry process to release the reservation before checking out again.</p>}
    {ready && order.paymentMode === 'TEST' && <>
      <p>If you already attempted payment, check its status before creating another order.</p>
      <Button type="button" variant="secondary" onClick={() => void check()} disabled={busy}>Check payment status</Button>
    </>}
    {message && <p>{message}</p>}
  </div>
  if (order.status !== 'PAYMENT_PENDING' || order.paymentState !== 'PENDING') return null
  return <div className="flex w-full flex-col gap-3 text-sm">
    <p className="text-text-secondary">Razorpay test mode only. The test amount is the stored artwork subtotal; shipping and taxes are not finalized. No real money or fulfillment.</p>
    {!ready ? <p className="text-text-muted">Test payments are not configured. Your unpaid order remains available.</p> : <div className="flex flex-wrap justify-center gap-2">
      <Button type="button" onClick={() => void pay()} disabled={busy || !eligible}>Pay with Razorpay Test</Button>
      <Button type="button" variant="secondary" onClick={() => void check()} disabled={busy}>Check payment status</Button>
    </div>}
    {!expired && !eligible && <p>Reservation eligibility is unavailable. Reload the order before attempting payment.</p>}
    {message && <p role="status" className="text-text-secondary">{message}</p>}
  </div>
}
