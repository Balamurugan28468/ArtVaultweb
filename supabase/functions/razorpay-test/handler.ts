// No frontend imports or provider SDK. All I/O is injectable for offline tests.
type Json = Record<string, unknown>
type Env = (name: string) => string | undefined
type Fetch = typeof fetch
class PaymentError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PaymentError(502, 'INVALID_RESPONSE')
  return value as Json
}
function text(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) throw new PaymentError(400, 'INVALID_REQUEST')
  return value
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const orderId = /^order_[A-Za-z0-9]+$/
const paymentId = /^pay_[A-Za-z0-9]+$/
export async function sha256(body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}
export async function validSignature(body: string, signature: string, secret: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const bytes = Uint8Array.from(signature.match(/../g) ?? [], v => parseInt(v, 16))
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(body))
}

export function createPaymentHandler(env: Env, request: Fetch = fetch) {
  return async (req: Request): Promise<Response> => {
    const origins = (env('PAYMENTS_ALLOWED_ORIGINS') ?? 'http://localhost:5173').split(',').map(v => v.trim())
    const origin = req.headers.get('origin')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      ...(origin && origins.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    }
    const reply = (body: Json, status = 200) => new Response(JSON.stringify(body), { status, headers })
    if (origin && !origins.includes(origin)) return reply({ error: 'ORIGIN_DENIED' }, 403)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (req.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405)
    try {
      const raw = await req.text()
      if (new TextEncoder().encode(raw).length > 65536) throw new PaymentError(413, 'REQUEST_TOO_LARGE')
      const webhook = new URL(req.url).pathname.endsWith('/webhook')
      const body = webhook ? null : object(JSON.parse(raw))
      const keyId = env('RAZORPAY_TEST_KEY_ID') ?? ''
      const keySecret = env('RAZORPAY_TEST_KEY_SECRET') ?? ''
      const webhookSecret = env('RAZORPAY_TEST_WEBHOOK_SECRET') ?? ''
      const backend = env('SUPABASE_URL') ?? ''
      const service = env('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      const enabled = env('RAZORPAY_TEST_ENABLED') === 'true' && /^rzp_test_[A-Za-z0-9]+$/.test(keyId)
        && !!keySecret && !!webhookSecret && !!service && /^https:\/\//.test(backend)
        && env('RAZORPAY_CAPTURE_MODE') === 'manual'
      // This safe readiness response exposes no keys or privileged configuration.
      if (body?.action === 'config') return reply({ enabled, mode: 'TEST' })
      if (!enabled) throw new PaymentError(503, 'TEST_PAYMENTS_UNAVAILABLE')

      const http = async (url: string, init: RequestInit = {}): Promise<unknown> => {
        let response: Response
        try { response = await request(url, { ...init, signal: AbortSignal.timeout(15000) }) }
        catch { throw new PaymentError(503, 'RECONCILIATION_REQUIRED') }
        if (!response.ok) {
          // Only a definite SQL validation rejection permits review handling.
          // Timeouts/5xx must retain CAPTURING and allow subsequent reconciliation.
          let code: unknown
          try { code = object(await response.json()).code } catch { /* No raw error output. */ }
          throw new PaymentError(response.status === 401 ? 401 : response.status >= 500 ? 503 : 409,
            url.startsWith(`${backend}/rest/v1/rpc/claim_razorpay_test_capture`) && code === '22023'
              ? 'CAPTURE_REJECTED' : 'PAYMENT_REQUEST_REJECTED')
        }
        const body = await response.text()
        try { return body ? JSON.parse(body) : null }
        catch { throw new PaymentError(502, 'INVALID_RESPONSE') }
      }
      const dbHeaders = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }
      const rpc = (name: string, args: Json) => http(`${backend}/rest/v1/rpc/${name}`, { method: 'POST', headers: dbHeaders, body: JSON.stringify(args) })
      const one = async (table: string, filter: string): Promise<Json> => {
        const value = await http(`${backend}/rest/v1/${table}?select=*&${filter}`, { headers: dbHeaders })
        if (!Array.isArray(value) || value.length !== 1) throw new PaymentError(404, 'PAYMENT_NOT_FOUND')
        return object(value[0])
      }
      const provider = (path: string, body?: Json) => http(`https://api.razorpay.com/v1/${path}`, {
        method: body ? 'POST' : 'GET', headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      const ownedPayment = async (id: string, buyer: string): Promise<Json> => {
        const payment = await one('payments', `id=eq.${id}&provider=eq.RAZORPAY_TEST&mode=eq.TEST`)
        await one('orders', `id=eq.${text(payment.order_id, uuid)}&buyer_id=eq.${buyer}`)
        return payment
      }
      const record = (p: Json, payment: Json, state: string, event: string, hash: string) => rpc('record_razorpay_test_result', {
        p_payment: p.id, p_provider_payment: payment.id, p_amount: payment.amount, p_currency: payment.currency,
        p_state: state, p_event: event, p_hash: hash,
      })
      const settle = async (p: Json, id: string, event?: string, eventHash?: string): Promise<string> => {
        let payment = object(await provider(`payments/${id}`))
        const validate = () => {
          if (payment.id !== id || payment.order_id !== p.provider_order_id || payment.amount !== p.amount_minor
            || payment.currency !== p.currency || !Number.isSafeInteger(payment.amount) || p.mode !== 'TEST'
            || !Number.isSafeInteger(payment.amount_refunded) || Number(payment.amount_refunded) < 0
            || Number(payment.amount_refunded) > Number(payment.amount)) throw new PaymentError(409, 'PAYMENT_MISMATCH')
        }
        const refunded = () => payment.status === 'refunded' || Number(payment.amount_refunded) > 0
        const reviewRefund = async () => record(p, payment, 'refunded', event ?? `refund:${id}:${payment.amount_refunded}`,
          eventHash ?? await sha256(`${id}|${payment.order_id}|${payment.amount}|${payment.currency}|refunded|${payment.amount_refunded}`))
        // API facts, not webhook/browser payloads, establish amount and capture.
        validate()
        if (refunded()) return String(await reviewRefund())
        if (payment.status === 'authorized' || payment.status === 'captured') {
          let claimed: unknown
          try {
            claimed = await rpc('claim_razorpay_test_capture', { p_payment: p.id, p_provider_payment: id, p_amount: payment.amount, p_currency: payment.currency })
          } catch (error) {
            if (payment.status === 'captured' && error instanceof PaymentError && error.code === 'CAPTURE_REJECTED') {
              await record(p, payment, 'review', `review:${id}`, await sha256(`${id}|${payment.order_id}|${payment.amount}|${payment.currency}|review`))
              return 'REVIEW'
            }
            throw error
          }
          if (payment.status === 'authorized') {
            if (claimed !== true) return 'PROCESSING'
            // If capture times out, CAPTURING remains protected. A later webhook
            // or buyer reconciliation fetch confirms the outcome without replay.
            await provider(`payments/${id}/capture`, { amount: payment.amount, currency: payment.currency })
            payment = object(await provider(`payments/${id}`))
            validate()
            if (refunded()) return String(await reviewRefund())
          }
        }
        if (!['captured', 'failed', 'refunded'].includes(String(payment.status))) return 'PROCESSING'
        if (payment.status === 'captured' && payment.captured !== true) return 'PROCESSING'
        return String(await record(p, payment, String(payment.status), event ?? `verify:${id}:${payment.status}`,
          eventHash ?? await sha256(`${id}|${payment.order_id}|${payment.amount}|${payment.currency}|${payment.status}`)))
      }

      if (webhook) {
        if (!await validSignature(raw, req.headers.get('x-razorpay-signature') ?? '', webhookSecret)) throw new PaymentError(401, 'INVALID_SIGNATURE')
        const eventBody = object(JSON.parse(raw))
        if (!['payment.authorized', 'payment.captured', 'payment.failed', 'refund.processed'].includes(String(eventBody.event))) return reply({ received: true })
        const event = text(req.headers.get('x-razorpay-event-id'), /^[A-Za-z0-9_-]{1,150}$/)
        const entity = object(object(object(eventBody.payload).payment).entity)
        const id = text(entity.id, paymentId)
        const p = await one('payments', `provider_order_id=eq.${text(entity.order_id, orderId)}&provider=eq.RAZORPAY_TEST&mode=eq.TEST`)
        const status = await settle(p, id, `webhook:${event}`, await sha256(raw))
        return reply({ received: true, status })
      }

      const bearer = req.headers.get('authorization') ?? ''
      if (!/^Bearer \S+$/.test(bearer)) throw new PaymentError(401, 'AUTHENTICATION_REQUIRED')
      const user = object(await http(`${backend}/auth/v1/user`, { headers: { apikey: service, Authorization: bearer } }))
      const buyer = text(user.id, uuid) // NEVER body.uid or user_metadata.role
      if (!body) throw new PaymentError(400, 'INVALID_REQUEST')
      if (body.action === 'start') {
        const p = object(await rpc('begin_razorpay_test_payment', { p_order: text(body.orderId, uuid), p_buyer: buyer }))
        if (p.created === true) {
          // Exactly one creator owns this call. Lost creation responses stay
          // CREATING for operator reconciliation; never make a second order.
          const created = object(await provider('orders', { amount: p.amount_minor, currency: p.currency, receipt: p.id, partial_payment: false }))
          if (created.amount !== p.amount_minor || created.currency !== p.currency || created.receipt !== p.id) throw new PaymentError(502, 'INVALID_RESPONSE')
          p.provider_order_id = text(created.id, orderId)
          await rpc('attach_razorpay_test_order', { p_payment: p.id, p_provider_order: p.provider_order_id })
          p.gateway_phase = 'READY'
        }
        if (p.gateway_phase !== 'READY') throw new PaymentError(409, 'RECONCILIATION_REQUIRED')
        return reply({ mode: 'TEST', paymentId: p.id, keyId, providerOrderId: p.provider_order_id, amount: p.amount_minor, currency: p.currency })
      }
      if (body.action === 'verify') {
        const p = await ownedPayment(text(body.paymentId, uuid), buyer)
        const id = text(body.razorpay_payment_id, paymentId)
        if (body.razorpay_order_id !== p.provider_order_id || !await validSignature(`${p.provider_order_id}|${id}`, String(body.razorpay_signature ?? ''), keySecret)) {
          throw new PaymentError(401, 'INVALID_SIGNATURE')
        }
        return reply({ status: await settle(p, id), mode: 'TEST' })
      }
      if (body.action === 'reconcile') {
        // Buyer-scoped recovery after refresh / lost browser callback.
        const o = await one('orders', `id=eq.${text(body.orderId, uuid)}&buyer_id=eq.${buyer}`)
        const p = await one('payments', `order_id=eq.${text(o.id, uuid)}&provider=eq.RAZORPAY_TEST&mode=eq.TEST`)
        if (!p.provider_order_id) throw new PaymentError(409, 'RECONCILIATION_REQUIRED')
        const payments = object(await provider(`orders/${text(p.provider_order_id, orderId)}/payments`))
        if (!Array.isArray(payments.items)) throw new PaymentError(502, 'INVALID_RESPONSE')
        const candidates = payments.items.map(object)
        const selected = candidates.find(v => v.status === 'refunded' || Number(v.amount_refunded) > 0)
          ?? candidates.find(v => v.status === 'captured') ?? candidates.find(v => v.id === p.provider_payment_id)
          ?? candidates.find(v => v.status === 'authorized') ?? candidates.find(v => v.status === 'failed')
        return reply({ mode: 'TEST', status: selected ? await settle(p, text(selected.id, paymentId)) : 'PENDING' })
      }
      throw new PaymentError(400, 'INVALID_REQUEST')
    } catch (error) {
      // Never return/log upstream bodies, auth headers, keys or personal data.
      return reply({ error: error instanceof PaymentError ? error.code : 'PAYMENT_REQUEST_FAILED' }, error instanceof PaymentError ? error.status : 400)
    }
  }
}
