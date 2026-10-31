import { createClient } from '@/lib/supabase/client'

interface CheckoutResult { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
interface CheckoutOptions {
  key: string; order_id: string; amount: number; currency: string; name: string; description: string;
  handler(result: CheckoutResult): void; modal: { ondismiss(): void }; retry: { enabled: boolean }
}
interface Checkout { open(): void; close(): void; on(event: 'payment.failed', handler: () => void): void }
declare global { interface Window { Razorpay?: new (options: CheckoutOptions) => Checkout } }
export interface PaymentSession { mode: 'TEST'; paymentId: string; keyId: string; providerOrderId: string; amount: number; currency: 'INR' }
export type PaymentResult = 'SUCCEEDED' | 'FAILED' | 'PENDING' | 'PROCESSING' | 'REVIEW'

async function invoke(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await createClient().functions.invoke('razorpay-test', { body })
  if (error || !data || typeof data !== 'object' || data.error) {
    // Provider/backend details may contain personal information. Keep the UI safe.
    throw new Error('Payment could not be confirmed. Check its status before trying again.')
  }
  return data as Record<string, unknown>
}
export async function testPaymentsAvailable(): Promise<boolean> {
  try { const result = await invoke({ action: 'config' }); return result.enabled === true && result.mode === 'TEST' }
  catch { return false }
}
export async function startTestPayment(orderId: string): Promise<PaymentSession> {
  const p = await invoke({ action: 'start', orderId })
  if (p.mode !== 'TEST' || typeof p.keyId !== 'string' || !/^rzp_test_[A-Za-z0-9]+$/.test(p.keyId)
    || typeof p.paymentId !== 'string' || typeof p.providerOrderId !== 'string' || !/^order_[A-Za-z0-9]+$/.test(p.providerOrderId)
    || !Number.isSafeInteger(p.amount) || Number(p.amount) < 100 || p.currency !== 'INR') {
    throw new Error('Test checkout configuration is invalid.')
  }
  return p as unknown as PaymentSession
}
function paymentResult(p: Record<string, unknown>): PaymentResult {
  if (p.mode !== 'TEST' || !['SUCCEEDED', 'FAILED', 'PENDING', 'PROCESSING', 'REVIEW'].includes(String(p.status))) {
    throw new Error('Payment status is unavailable.')
  }
  return p.status as PaymentResult
}
export async function verifyTestPayment(paymentId: string, result: CheckoutResult): Promise<PaymentResult> {
  return paymentResult(await invoke({ action: 'verify', paymentId,
    razorpay_order_id: result.razorpay_order_id, razorpay_payment_id: result.razorpay_payment_id, razorpay_signature: result.razorpay_signature,
  }))
}
export async function reconcileTestPayment(orderId: string): Promise<PaymentResult> {
  return paymentResult(await invoke({ action: 'reconcile', orderId }))
}

let loading: Promise<void> | undefined
export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  if (loading) return loading
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    const fail = () => { clearTimeout(timer); script.remove(); loading = undefined; reject(new Error('Test checkout could not load. Please retry.')) }
    const timer = window.setTimeout(fail, 15000)
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => { if (!window.Razorpay) { fail(); return }; clearTimeout(timer); resolve() }
    script.onerror = fail
    document.head.appendChild(script)
  })
  return loading
}
export function openTestCheckout(p: PaymentSession, events: { result(value: CheckoutResult): void; dismiss(): void; failed(): void }): () => void {
  if (!window.Razorpay || p.mode !== 'TEST' || !p.keyId.startsWith('rzp_test_')) throw new Error('Test checkout is unavailable.')
  const checkout = new window.Razorpay({
    key: p.keyId, order_id: p.providerOrderId, amount: p.amount, currency: p.currency,
    name: 'ArtVault — TEST', description: 'Sandbox artwork subtotal. No real payment or shipping.',
    handler: events.result, modal: { ondismiss: events.dismiss }, retry: { enabled: true },
  })
  checkout.on('payment.failed', events.failed)
  checkout.open()
  return () => checkout.close()
}
