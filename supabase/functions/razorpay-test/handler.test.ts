import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createPaymentHandler, validSignature } from './handler'

const buyer = '00000000-0000-4000-8000-000000000001'
const order = '00000000-0000-4000-8000-000000000002'
const payment = '00000000-0000-4000-8000-000000000003'
const configuration: Record<string, string> = {
  SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'unit-test-service-key',
  RAZORPAY_TEST_ENABLED: 'true', RAZORPAY_TEST_KEY_ID: 'rzp_test_fixture',
  RAZORPAY_TEST_KEY_SECRET: 'unit-test-key-secret', RAZORPAY_TEST_WEBHOOK_SECRET: 'unit-test-webhook-secret', RAZORPAY_CAPTURE_MODE: 'manual',
}
const p = { id: payment, order_id: order, provider_order_id: 'order_fixture', amount_minor: 10000, currency: 'INR', mode: 'TEST', gateway_phase: 'READY' }
const captured = { id: 'pay_fixture', order_id: 'order_fixture', amount: 10000, currency: 'INR', status: 'captured', captured: true, amount_refunded: 0 }
const signature = (raw: string, key = configuration.RAZORPAY_TEST_KEY_SECRET) => createHmac('sha256', key).update(raw).digest('hex')
const verification = { action: 'verify', paymentId: payment, razorpay_order_id: 'order_fixture', razorpay_payment_id: 'pay_fixture', razorpay_signature: signature('order_fixture|pay_fixture') }

function setup(responses: unknown[] = [], overrides: Record<string, string> = {}) {
  const queue = [...responses]
  // Unexpected requests fail the test rather than ever reaching the network.
  const fetcher = vi.fn<typeof fetch>(async () => {
    if (!queue.length) throw new Error('Unexpected outbound request')
    const value = queue.shift()
    if (value instanceof Error) throw value
    if (value instanceof Response) return value
    return new Response(value === null ? '' : JSON.stringify(value), { status: 200 })
  })
  const handler = createPaymentHandler(name => ({ ...configuration, ...overrides })[name], fetcher)
  const call = (body: unknown, headers: Record<string, string> = {}) => handler(new Request('https://edge.example.test/razorpay-test', {
    method: 'POST', headers: { Authorization: 'Bearer verified-session-fixture', Origin: 'http://localhost:5173', ...headers }, body: JSON.stringify(body),
  }))
  return { handler, call, fetcher }
}

describe('test-only configuration and authentication', () => {
  it.each([
    { RAZORPAY_TEST_ENABLED: '' }, { RAZORPAY_TEST_KEY_ID: 'rzp_live_rejected' },
    { RAZORPAY_TEST_KEY_SECRET: '' }, { RAZORPAY_TEST_WEBHOOK_SECRET: '' }, { RAZORPAY_CAPTURE_MODE: 'automatic' },
  ])('fails closed for missing or unsafe configuration %j', async overrides => {
    const { call, fetcher } = setup([], overrides)
    expect(await (await call({ action: 'config' })).json()).toEqual({ enabled: false, mode: 'TEST' })
    expect((await call({ action: 'start', orderId: order })).status).toBe(503)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('does not disclose keys in readiness', async () => {
    const { call } = setup()
    expect(await (await call({ action: 'config' })).json()).toEqual({ enabled: true, mode: 'TEST' })
  })
  it('rejects signed-out calls before any database access', async () => {
    const { call, fetcher } = setup()
    expect((await call({ action: 'start', orderId: order }, { Authorization: '' })).status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('verifies bearer sessions with Auth and rejects expired JWTs', async () => {
    const { call, fetcher } = setup([new Response('', { status: 401 })])
    expect((await call({ action: 'start', orderId: order })).status).toBe(401)
    expect(fetcher.mock.calls[0][0]).toBe('https://db.example.test/auth/v1/user')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('rejects unapproved browser origins', async () => {
    const { call, fetcher } = setup()
    expect((await call({ action: 'start' }, { Origin: 'https://attacker.example.test' })).status).toBe(403)
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('provider order initiation', () => {
  it('uses verified identity and database prices, ignoring forged body fields', async () => {
    const { call, fetcher } = setup([{ id: buyer, user_metadata: { role: 'ADMIN' } }, { ...p, created: true }, { id: 'order_fixture', amount: 10000, currency: 'INR', receipt: payment }, null])
    const response = await call({ action: 'start', orderId: order, buyerId: order, amount: 1, currency: 'USD', role: 'ADMIN' })
    expect(response.status).toBe(200)
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({ p_order: order, p_buyer: buyer })
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({ amount: 10000, currency: 'INR', receipt: payment, partial_payment: false })
    expect(await response.json()).toEqual({ mode: 'TEST', paymentId: payment, keyId: 'rzp_test_fixture', providerOrderId: 'order_fixture', amount: 10000, currency: 'INR' })
  })
  it('reuses existing provider order without a new provider request', async () => {
    const { call, fetcher } = setup([{ id: buyer }, { ...p, created: false }])
    expect((await call({ action: 'start', orderId: order })).status).toBe(200)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('does not recreate an order after an ambiguous creation response', async () => {
    const { call, fetcher } = setup([{ id: buyer }, { ...p, gateway_phase: 'CREATING', created: false }])
    expect((await call({ action: 'start', orderId: order })).status).toBe(409)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('network failure never yields a success or a second provider call', async () => {
    const { call, fetcher } = setup([{ id: buyer }, { ...p, created: true }, new Error('timeout')])
    expect((await call({ action: 'start', orderId: order })).status).toBe(503)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
})

describe('verification and capture', () => {
  it.each([100, 10000])('sends refunded amount %i to review without capture or paid settlement', async amount => {
    const { call, fetcher } = setup([{ id: buyer }, [p], [{ id: order }], { ...captured, amount_refunded: amount }, 'REVIEW'])
    expect(await (await call(verification)).json()).toMatchObject({ status: 'REVIEW' })
    expect(fetcher).toHaveBeenCalledTimes(5)
    expect(String(fetcher.mock.calls[4][0])).toContain('record_razorpay_test_result')
    expect(JSON.parse(String(fetcher.mock.calls[4][1]?.body))).toMatchObject({ p_state: 'refunded' })
  })
  it.each([-1, 10001, undefined])('rejects invalid refund facts %s', async amount => {
    const { call, fetcher } = setup([{ id: buyer }, [p], [{ id: order }], { ...captured, amount_refunded: amount }])
    expect((await call(verification)).status).toBe(409)
    expect(fetcher).toHaveBeenCalledTimes(4)
  })
  it('rejects invalid signatures without provider calls or settlement', async () => {
    const { call, fetcher } = setup([{ id: buyer }, [p], [{ id: order, buyer_id: buyer }]])
    expect((await call({ ...verification, razorpay_signature: '0'.repeat(64) })).status).toBe(401)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('uses the stored provider order when validating signatures', async () => {
    const { call, fetcher } = setup([{ id: buyer }, [p], [{ id: order }]])
    expect((await call({ ...verification, razorpay_order_id: 'order_forged', razorpay_signature: signature('order_forged|pay_fixture') })).status).toBe(401)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('cannot verify another buyer payment', async () => {
    const { call, fetcher } = setup([{ id: buyer }, [p], []])
    expect((await call(verification)).status).toBe(404)
    expect(String(fetcher.mock.calls[2][0])).toContain(`buyer_id=eq.${buyer}`)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it.each([{ amount: 1 }, { currency: 'USD' }, { order_id: 'order_other' }])('rejects mismatched provider facts %j', async change => {
    const { call, fetcher } = setup([{ id: buyer }, [p], [{ id: order }], { ...captured, ...change }])
    expect((await call(verification)).status).toBe(409)
    expect(fetcher).toHaveBeenCalledTimes(4)
  })
  it('settles only fetched captured payment facts', async () => {
    const { call, fetcher } = setup([{ id: buyer }, [p], [{ id: order }], captured, true, 'SUCCEEDED'])
    expect(await (await call(verification)).json()).toEqual({ status: 'SUCCEEDED', mode: 'TEST' })
    expect(String(fetcher.mock.calls[5][0])).toContain('record_razorpay_test_result')
    expect(JSON.parse(String(fetcher.mock.calls[5][1]?.body))).toMatchObject({ p_state: 'captured', p_amount: 10000 })
  })
  it('claims inventory protection before capture and re-fetches final state', async () => {
    const { call, fetcher } = setup([{ id: buyer }, [p], [{ id: order }], { ...captured, status: 'authorized', captured: false }, true, captured, captured, 'SUCCEEDED'])
    expect(await (await call(verification)).json()).toMatchObject({ status: 'SUCCEEDED' })
    expect(String(fetcher.mock.calls[4][0])).toContain('claim_razorpay_test_capture')
    expect(String(fetcher.mock.calls[5][0])).toContain('/payments/pay_fixture/capture')
    expect(JSON.parse(String(fetcher.mock.calls[5][1]?.body))).toEqual({ amount: 10000, currency: 'INR' })
  })
  it('does not repeat capture when another invocation has claimed it', async () => {
    const { call, fetcher } = setup([{ id: buyer }, [p], [{ id: order }], { ...captured, status: 'authorized' }, false])
    expect(await (await call(verification)).json()).toMatchObject({ status: 'PROCESSING' })
    expect(fetcher).toHaveBeenCalledTimes(5)
  })
  it('capture timeout does not settle, release inventory or pretend success', async () => {
    const { call, fetcher } = setup([{ id: buyer }, [p], [{ id: order }], { ...captured, status: 'authorized' }, true, new Error('timeout')])
    expect((await call(verification)).status).toBe(503)
    expect(fetcher).toHaveBeenCalledTimes(6)
  })
  it('a capture arriving after expiry goes to review, not paid', async () => {
    const { call, fetcher } = setup([{ id: buyer }, [p], [{ id: order }], captured, new Response(JSON.stringify({ code: '22023' }), { status: 400 }), 'REVIEW'])
    expect(await (await call(verification)).json()).toMatchObject({ status: 'REVIEW' })
    expect(JSON.parse(String(fetcher.mock.calls[5][1]?.body))).toMatchObject({ p_state: 'review' })
  })
  it('a transient database error retains the capture for a later reconciliation', async () => {
    const { call, fetcher } = setup([{ id: buyer }, [p], [{ id: order }], captured, new Response('', { status: 503 })])
    expect((await call(verification)).status).toBe(503)
    expect(fetcher).toHaveBeenCalledTimes(5)
  })
  it('can recover captured payment after browser refresh without trusting a callback', async () => {
    const { call } = setup([{ id: buyer }, [{ id: order }], [p], { items: [captured] }, captured, true, 'SUCCEEDED'])
    expect(await (await call({ action: 'reconcile', orderId: order })).json()).toMatchObject({ status: 'SUCCEEDED' })
  })
})

describe('signed webhooks', () => {
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: captured } } })
  function request(raw: string, sig = signature(raw, configuration.RAZORPAY_TEST_WEBHOOK_SECRET)) {
    return new Request('https://edge.example.test/razorpay-test/webhook', { method: 'POST', headers: { 'x-razorpay-signature': sig, 'x-razorpay-event-id': 'event_fixture' }, body: raw })
  }
  it('validates HMAC using the exact raw payload', async () => {
    expect(await validSignature(body, signature(body, configuration.RAZORPAY_TEST_WEBHOOK_SECRET), configuration.RAZORPAY_TEST_WEBHOOK_SECRET)).toBe(true)
    expect(await validSignature(body + ' ', signature(body), configuration.RAZORPAY_TEST_KEY_SECRET)).toBe(false)
  })
  it('reconciles a signed refund.processed event using current API facts', async () => {
    const raw = JSON.stringify({ event: 'refund.processed', payload: { refund: { entity: { payment_id: captured.id } }, payment: { entity: captured } } })
    const { handler, fetcher } = setup([[p], { ...captured, amount_refunded: 100 }, 'REVIEW'])
    expect(await (await handler(request(raw))).json()).toEqual({ received: true, status: 'REVIEW' })
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toMatchObject({ p_state: 'refunded', p_event: 'webhook:event_fixture' })
  })
  it('rejects unsigned webhooks without any network or DB call', async () => {
    const { handler, fetcher } = setup()
    expect((await handler(request(body, ''))).status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('records event identity and payload hash only after signature + API validation', async () => {
    const { handler, fetcher } = setup([[p], captured, true, 'SUCCEEDED'])
    expect(await (await handler(request(body))).json()).toEqual({ received: true, status: 'SUCCEEDED' })
    expect(JSON.parse(String(fetcher.mock.calls[3][1]?.body))).toMatchObject({ p_event: 'webhook:event_fixture', p_hash: expect.stringMatching(/^[a-f0-9]{64}$/) })
  })
  it('does not trust a signed payload amount instead of current API facts', async () => {
    const { handler } = setup([[p], { ...captured, amount: 1 }])
    expect((await handler(request(body))).status).toBe(409)
  })
})
