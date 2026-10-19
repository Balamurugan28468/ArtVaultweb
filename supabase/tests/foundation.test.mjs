import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// A fresh in-memory PostgreSQL instance only. No URL, env loading or network DB.
const db = new PGlite()
const id = (n) => '00000000-0000-4000-8000-' + n.toString(16).padStart(12, '0')
const [buyer, other, seller, seller2, admin, superAdmin] = [1, 2, 3, 4, 5, 6].map(id)
const category = id(10), art = id(11), draft = id(12), art2 = id(13)
const order = id(20), item = id(21), item2 = id(22), image = id(23), ar = id(24)
const cart = id(30), otherCart = id(31), address = id(32), conversation = id(40)
const publicTables = ["profiles","seller_profiles","artist_profiles","categories","artworks","artwork_images","inventory","carts","cart_items","wishlist_items","likes","follows","addresses","orders","order_addresses","order_items","inventory_reservations","order_events","payments","payment_events","refunds","shipments","shipment_items","auctions","auction_items","bids","notifications","admin_logs","artwork_ar_assets","artwork_analyses","ai_conversations","ai_messages","artwork_tags"]
const path = seller + '/' + art + '/' + image

async function session(uid, run, role = 'authenticated', claims = {}) {
  await db.exec('begin; set local role ' + role)
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)",
      [uid ?? '', JSON.stringify({ sub: uid, ...claims })])
    return await run()
  } finally { await db.exec('rollback') }
}
async function rows(sql, params = []) { return (await db.query(sql, params)).rows }
async function denied(sql, params = []) {
  await assert.rejects(db.query(sql, params), (error) => ['42501', '23514', '23505', '23503'].includes(error.code))
}

before(async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated, service_role;
    grant all on storage.objects to anon, authenticated, service_role;
  `)
  const directory = new URL('../migrations/', import.meta.url)
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    let sql = await readFile(new URL(file, directory), 'utf8')
    if (file === '20261011075254_automatic_reservation_expiry.sql') {
      // PGlite cannot load background-worker extensions. Stub ONLY Cron registration;
      // run the real worker, wrapper, grants and schedule SQL. Hosted runs prove scheduling.
      assert.equal(sql.match(/create extension if not exists pg_cron with schema pg_catalog;/g)?.length, 1)
      await db.exec(`create schema cron;
        create table cron.job(jobname text primary key, schedule text, command text, active boolean default true);
        create function cron.schedule(text,text,text) returns bigint language sql as $$
          insert into cron.job(jobname,schedule,command) values ($1,$2,$3)
          on conflict(jobname) do update set schedule=$2,command=$3 returning 1::bigint;
        $$;`)
      sql = sql.replace('create extension if not exists pg_cron with schema pg_catalog;', '')
    }
    await db.exec(sql)
  }
  for (const user of [buyer, other, seller, seller2, admin, superAdmin]) {
    await db.query("insert into auth.users(id,raw_user_meta_data) values ($1, '{\"role\":\"SUPER_ADMIN\"}')", [user])
  }
  for (const [uid, role] of [[seller, 'SELLER'], [seller2, 'SELLER'], [admin, 'ADMIN'], [superAdmin, 'SUPER_ADMIN']]) {
    await db.query('update private.user_roles set role = $2::public.app_role where id = $1', [uid, role])
  }
  await db.exec(`
    insert into public.seller_profiles(id,business_name,description,contact_email,status,reviewed_by,reviewed_at) values
      ('${seller}','Seller One','Valid seller description','one@example.test','APPROVED','${admin}',now()),
      ('${seller2}','Seller Two','Valid seller description','two@example.test','APPROVED','${admin}',now());
    insert into public.artist_profiles(id,display_name,bio) values ('${seller}','Artist One','Public artist biography');
    insert into public.categories(id,slug,name) values ('${category}','painting','Painting');
    insert into public.artworks(id,seller_id,category_id,title,price_minor,status) values
      ('${art}','${seller}','${category}','Published',10000,'PUBLISHED'),
      ('${draft}','${seller}','${category}','Private',10000,'DRAFT'),
      ('${art2}','${seller2}','${category}','Other Seller',10000,'PUBLISHED');
    insert into public.inventory(artwork_id,physical_quantity,reserved_quantity) values ('${art}',2,1), ('${draft}',1,0), ('${art2}',1,1);
    insert into public.artwork_images(id,artwork_id,object_path,position,content_type,byte_size,source_sha256)
      values ('${image}','${art}','${path}',0,'image/png',100,repeat('a',64));
    insert into public.orders(id,buyer_id,subtotal_minor,total_minor) values ('${order}','${buyer}',20000,20000);
    insert into public.order_items(id,order_id,artwork_id,seller_id,title,unit_price_minor,quantity) values
      ('${item}','${order}','${art}','${seller}','Snapshot A',10000,1),
      ('${item2}','${order}','${art2}','${seller2}','Snapshot B',10000,1);
    insert into public.order_addresses(order_id,full_name,address_line1,city,state,postal_code,country)
      values ('${order}','Private Buyer','123 Example','City','State','12345','India');
    insert into public.inventory_reservations(order_item_id,artwork_id,quantity,expires_at) values ('${item}','${art}',1,now()+interval '30 minutes');
    insert into public.carts(id,user_id) values ('${cart}','${buyer}'), ('${otherCart}','${other}');
    insert into public.cart_items(cart_id,artwork_id,quantity) values ('${cart}','${art}',1), ('${otherCart}','${art2}',1);
    insert into public.addresses(id,user_id,full_name,address_line1,city,state,postal_code,country,is_default)
      values ('${address}','${buyer}','Buyer One','123 Example','City','State','12345','India',true);
    insert into public.artwork_ar_assets(id,artwork_id,image_id,width_mm,height_mm,includes_frame,measured_by,source_sha256,model_sha256,generator_version,format,object_path,status)
      values ('${ar}','${art}','${image}',300,200,false,'${admin}',repeat('a',64),repeat('b',64),'test','GLB','proof/model.glb','READY');
    insert into storage.objects(bucket_id,name) values ('artwork-images','${path}'),('ar-assets','proof/model.glb');
    insert into public.admin_logs(actor_id,action,target_type,target_id) values ('${admin}','PUBLISH','artwork','${art}');
    insert into public.ai_conversations(id,user_id) values ('${conversation}','${buyer}');
    insert into public.ai_messages(conversation_id,sequence,role,content) values ('${conversation}',1,'ASSISTANT','Stored test message');
  `)
})
after(async () => { await db.close() })

// Isolated live-shaped fixtures only: no provider request or hosted data mutation.
async function fulfillmentSession(run) {
  return session(seller, async () => {
    await db.exec('reset role')
    await db.query("update public.orders set status='PAID',payment_state='PAID' where id=$1", [order])
    await db.query("insert into public.payments(order_id,provider,idempotency_key,amount_minor,currency,status) values($1,'ISOLATED_LIVE_FIXTURE','fulfillment-fixture',20000,'INR','SUCCEEDED')", [order])
    await db.exec('set local role authenticated')
    const asUser = uid => db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid])
    const advance = (action, carrier = null, tracking = null) => rows('select public.advance_seller_fulfillment($1,$2,$3,$4) as status', [order,action,carrier,tracking])
    return run({ advance, asUser })
  })
}
test('multi-seller fulfillment progresses conservatively, retries once, and never changes stock', () => fulfillmentSession(async ({ advance, asUser }) => {
  const stock = await rows('select * from public.inventory order by artwork_id')
  await advance('PROCESS'); await advance('PROCESS')
  assert.equal((await advance('SHIP','Manual Carrier','ABC-123'))[0].status,'PROCESSING')
  await advance('SHIP','Manual Carrier','ABC-123')
  assert.equal((await rows('select count(*)::int as n from public.shipments'))[0].n,1)
  await asUser(seller2); await advance('PROCESS')
  assert.equal((await advance('SHIP','Second Carrier','DEF-456'))[0].status,'SHIPPED')
  assert.equal((await advance('DELIVER'))[0].status,'SHIPPED')
  await asUser(seller)
  assert.equal((await advance('DELIVER'))[0].status,'DELIVERED')
  await advance('DELIVER')
  await asUser(buyer)
  assert.equal((await rows("select count(*)::int as n from public.order_events where order_id=$1 and event_type='DELIVERED'",[order]))[0].n,1)
  await asUser(seller)
  assert.deepEqual(await rows('select * from public.inventory order by artwork_id'),stock)
}))
test('seller fulfillment projection contains only own items and shipping snapshot, no payment internals', () => fulfillmentSession(async () => {
  const data=(await rows('select public.get_seller_fulfillment_orders() as data'))[0].data
  assert.equal(data.length,1); assert.equal(data[0].items.length,1)
  assert.equal(data[0].items[0].id,item); assert.equal(data[0].address.fullName,'Private Buyer')
  assert.equal(data[0].canFulfill,true)
  assert.equal(JSON.stringify(data).includes('provider_payment_id'),false)
}))
for(const uid of [buyer,other,admin]) test(`non-seller ${uid} cannot fulfill`, () => fulfillmentSession(async ({ advance,asUser }) => {
  await asUser(uid); await assert.rejects(advance('PROCESS'),{code:'42501'})
}))
test('seller cannot fulfill an order without their items', () => fulfillmentSession(async () => {
  await db.exec('reset role')
  const foreignOrder=id(901)
  await db.query("insert into public.orders(id,buyer_id,subtotal_minor,total_minor) values($1,$2,10000,10000)",[foreignOrder,other])
  await db.query("insert into public.order_items(order_id,artwork_id,seller_id,title,unit_price_minor,quantity) values($1,$2,$3,'Other seller only',10000,1)",[foreignOrder,art2,seller2])
  await db.exec('set local role authenticated')
  await assert.rejects(db.query("select public.advance_seller_fulfillment($1,'PROCESS')",[foreignOrder]),{code:'42501'})
}))
for(const [action,carrier,tracking] of [['SHIP','Carrier','ABC'],['DELIVER',null,null],['PAID',null,null]])
 test(`rejects invalid initial fulfillment transition ${action}`, () => fulfillmentSession(async ({advance}) => {
  await assert.rejects(advance(action,carrier,tracking),{code:'22023'})
 }))
test('tracking validates server-side', () => fulfillmentSession(async ({advance}) => {
  await advance('PROCESS'); await assert.rejects(advance('SHIP','X','<script>'),{code:'22023'})
}))
test('seller cannot overwrite shipped tracking', () => fulfillmentSession(async ({advance}) => {
  await advance('PROCESS'); await advance('SHIP','Carrier','ABC')
  await assert.rejects(advance('SHIP','Carrier','DIFFERENT'),{code:'22023'})
}))
test('TEST paid orders remain visible but cannot expose shipping or enter real fulfillment', () => fulfillmentSession(async ({advance}) => {
  await db.exec('reset role'); await db.query("update public.orders set payment_mode='TEST' where id=$1",[order]); await db.exec('set local role authenticated')
  const data=(await rows('select public.get_seller_fulfillment_orders() as data'))[0].data
  assert.equal(data[0].test,true); assert.equal(data[0].canFulfill,false); assert.equal(data[0].address,null)
  await assert.rejects(advance('PROCESS'),{code:'22023'})
}))
test('buyer and unrelated buyer shipment privacy and direct-write denial', () => fulfillmentSession(async ({advance,asUser}) => {
  await advance('PROCESS'); await asUser(other)
  assert.equal((await rows('select * from public.shipments')).length,0)
  await asUser(buyer); assert.equal((await rows('select * from public.shipments')).length,1)
  await denied("update public.shipments set status='DELIVERED'")
}))
test('unpaid orders cannot be fulfilled', () => fulfillmentSession(async ({advance}) => {
  await db.exec('reset role'); await db.query("update public.orders set payment_state='PENDING',status='PAYMENT_PENDING' where id=$1",[order]); await db.exec('set local role authenticated')
  await assert.rejects(advance('PROCESS'),{code:'22023'})
}))
test('refund review prevents fulfillment without automatic restocking', () => fulfillmentSession(async ({advance}) => {
  await db.exec('reset role'); await db.query("update public.payments set gateway_phase='REVIEW' where order_id=$1",[order]); await db.exec('set local role authenticated')
  await assert.rejects(advance('PROCESS'),{code:'22023'})
}))
test('anonymous callers cannot execute fulfillment RPC', () => session(null,() => denied("select public.advance_seller_fulfillment($1,'PROCESS')",[order]),'anon'))

test('Cron registers one active bounded minute job using the shared private worker', async () => {
  assert.deepEqual(await rows('select * from cron.job'), [{
    jobname: 'artvault-expire-checkout-reservations', schedule: '* * * * *',
    command: 'select private.expire_checkout_reservations(100);', active: true,
  }])
  assert.equal((await rows('select private.expire_checkout_reservations(100) as n'))[0].n, 0)
  assert.equal((await rows('select private.expire_checkout_reservations(100) as n'))[0].n, 0)
  await assert.rejects(db.query('select private.expire_checkout_reservations(501)'), { code: '22023' })
})

for (const role of ['anon', 'authenticated', 'service_role']) {
  test(`${role} cannot execute the scheduler worker, even with forged admin claims`, () =>
    session(buyer, () => denied('select private.expire_checkout_reservations(100)'), role, { role: 'SUPER_ADMIN' }))
}

// Each payment test rolls back its fresh checkout. No hosted/provider requests.
async function paymentSession(run) {
  return session(buyer, async () => {
    const receipt = (await rows('select public.create_checkout_order($1::uuid[],$2::uuid,$3) as r', [[art], address, 'razorpay-test-checkout-key']))[0].r
    await db.exec('set local role service_role')
    const begin = async (uid = buyer) => (await rows('select public.begin_razorpay_test_payment($1,$2) as p', [receipt.orderId, uid]))[0].p
    const p = await begin()
    const attach = () => db.query("select public.attach_razorpay_test_order($1,'order_testProvider')", [p.id])
    const claim = (amount = 10000, currency = 'INR', providerPayment = 'pay_testCaptured') => rows('select public.claim_razorpay_test_capture($1,$2,$3,$4) as claimed', [p.id, providerPayment, amount, currency])
    const record = (state = 'captured', event = 'test-event-1', providerPayment = 'pay_testCaptured', hash = 'c'.repeat(64)) => rows('select public.record_razorpay_test_result($1,$2,10000,\'INR\',$3,$4,$5) as status', [p.id, providerPayment, state, event, hash])
    const expire = async () => {
      await db.exec('set local role authenticated')
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [admin])
      const result = (await rows('select public.expire_checkout_reservations() as n'))[0].n
      await db.exec('set local role service_role')
      return result
    }
    const elapse = () => db.query("update public.inventory_reservations set expires_at=now()-interval '1 minute' where order_item_id in (select id from public.order_items where order_id=$1)", [receipt.orderId])
    return run({ receipt, p, begin, attach, claim, record, expire, elapse })
  })
}

test('payment initiation is idempotent, test-labelled and uses the immutable order total', () => paymentSession(async ({ receipt, p, begin, attach }) => {
  assert.equal(p.created, true)
  assert.equal(p.mode, 'TEST')
  assert.equal(p.amount_minor, 10000)
  assert.equal(p.gateway_phase, 'CREATING')
  const duplicate = await begin()
  assert.equal(duplicate.id, p.id)
  assert.equal(duplicate.created, false)
  await attach(); await attach()
  assert.equal((await begin()).provider_order_id, 'order_testProvider')
  assert.equal((await rows('select payment_mode from public.orders where id=$1', [receipt.orderId]))[0].payment_mode, 'TEST')
}))

test('all payment transition RPCs deny browsers, signed-out users and forged admin metadata', async () => {
  const calls = [
    ['select public.begin_razorpay_test_payment($1,$2)', [order, buyer]],
    ['select public.attach_razorpay_test_order($1,$2)', [order, 'order_forged']],
    ['select public.claim_razorpay_test_capture($1,$2,$3,$4)', [order, 'pay_forged', 1, 'INR']],
    ['select public.record_razorpay_test_result($1,$2,$3,$4,$5,$6,$7)', [order, 'pay_forged', 1, 'INR', 'captured', 'forged', 'a'.repeat(64)]],
  ]
  for (const [uid, role] of [[null, 'anon'], [buyer, 'authenticated'], [seller, 'authenticated'], [admin, 'authenticated']]) {
    for (const [sql, params] of calls) await session(uid, () => denied(sql, params), role, { role: 'SUPER_ADMIN' })
  }
})

test('payment initiation rejects another buyer even through the trusted server boundary', () => paymentSession(async ({ begin }) => {
  await assert.rejects(begin(other), e => e.code === '42501')
}))

test('provider order assignment cannot be replaced by a second provider order', () => paymentSession(async ({ p, attach }) => {
  await attach()
  await assert.rejects(db.query("select public.attach_razorpay_test_order($1,'order_second')", [p.id]), e => e.code === '22023')
}))

for (const [name, amount, currency] of [['amount', 1, 'INR'], ['currency', 10000, 'USD']]) {
  test(`capture rejects mismatched ${name}`, () => paymentSession(async ({ attach, claim }) => {
    await attach()
    await assert.rejects(claim(amount, currency), e => e.code === '22023')
  }))
}

test('capture claim has one winner and captured settlement consumes stock exactly once', () => paymentSession(async ({ receipt, p, attach, claim, record }) => {
  await attach()
  assert.equal((await claim())[0].claimed, true)
  assert.equal((await claim())[0].claimed, false)
  assert.equal((await record())[0].status, 'SUCCEEDED')
  assert.equal((await record())[0].status, 'SUCCEEDED')
  assert.equal((await record('captured', 'second-valid-event'))[0].status, 'SUCCEEDED')
  assert.deepEqual((await rows('select physical_quantity,reserved_quantity from public.inventory where artwork_id=$1', [art]))[0], { physical_quantity: 1, reserved_quantity: 1 })
  assert.deepEqual((await rows('select status,payment_state,payment_mode from public.orders where id=$1', [receipt.orderId]))[0], { status: 'PAID', payment_state: 'PAID', payment_mode: 'TEST' })
  assert.equal((await rows("select count(*)::int as n from public.order_events where order_id=$1 and event_type='PAID'", [receipt.orderId]))[0].n, 1)
  assert.equal((await rows('select gateway_phase from public.payments where id=$1', [p.id]))[0].gateway_phase, 'SETTLED')
}))

test('different payment IDs cannot share an active capture claim', () => paymentSession(async ({ attach, claim }) => {
  await attach(); await claim()
  await assert.rejects(claim(10000, 'INR', 'pay_other'), e => e.code === '22023')
}))

test('moderation withdrawal after checkout prevents payment capture', () => paymentSession(async ({ attach, claim }) => {
  await attach()
  await db.query("update public.artworks set status='SUSPENDED' where id=$1", [art])
  await assert.rejects(claim(), e => e.code === '22023')
}))

test('seller approval withdrawal after checkout prevents payment initiation', () => paymentSession(async ({ begin }) => {
  await db.query("update public.seller_profiles set status='PENDING',reviewed_at=null,reviewed_by=null where id=$1", [seller])
  await assert.rejects(begin(), e => e.code === '22023')
}))

test('expiry wins before capture: no stock is consumed and repeated release is safe', () => paymentSession(async ({ receipt, attach, elapse, expire, claim }) => {
  await attach(); await elapse()
  assert.equal(await expire(), 1)
  assert.equal(await expire(), 0)
  assert.deepEqual((await rows('select physical_quantity,reserved_quantity from public.inventory where artwork_id=$1', [art]))[0], { physical_quantity: 2, reserved_quantity: 1 })
  assert.equal((await rows('select status from public.orders where id=$1', [receipt.orderId]))[0].status, 'CANCELLED')
  await assert.rejects(claim(), e => e.code === '22023')
}))

test('capture wins before expiry: pending capture holds inventory and later settlement is safe', () => paymentSession(async ({ attach, claim, elapse, expire, record }) => {
  await attach(); await claim(); await elapse()
  assert.equal(await expire(), 0)
  assert.equal((await record())[0].status, 'SUCCEEDED')
  assert.equal(await expire(), 0)
}))

test('a verified terminal capture failure removes the hold so expiry can release once', () => paymentSession(async ({ attach, claim, elapse, expire, record }) => {
  await attach(); await claim(); await elapse()
  assert.equal((await record('failed', 'capture-failed'))[0].status, 'FAILED')
  assert.equal(await expire(), 1)
  assert.equal(await expire(), 0)
}))

test('late captured payment is flagged for review and never resurrects expired inventory', () => paymentSession(async ({ receipt, attach, elapse, expire, record }) => {
  await attach(); await elapse(); await expire()
  assert.equal((await record())[0].status, 'REVIEW')
  assert.equal((await rows('select status from public.orders where id=$1', [receipt.orderId]))[0].status, 'CANCELLED')
  assert.equal((await rows('select physical_quantity from public.inventory where artwork_id=$1', [art]))[0].physical_quantity, 2)
}))

test('trusted expiry preserves cancelled history, rejects new payment and cannot release twice', () => paymentSession(async ({ receipt, elapse, expire, begin }) => {
  const before = (await rows('select physical_quantity,reserved_quantity from public.inventory where artwork_id=$1', [art]))[0]
  await elapse()
  assert.equal(await expire(), 1)
  assert.equal(await expire(), 0)
  assert.equal((await rows('select status,cancellation_reason from public.orders where id=$1', [receipt.orderId]))[0].status, 'CANCELLED')
  const after = (await rows('select physical_quantity,reserved_quantity from public.inventory where artwork_id=$1', [art]))[0]
  assert.equal(after.reserved_quantity, before.reserved_quantity - 1)
  assert.equal(after.physical_quantity, before.physical_quantity)
  await assert.rejects(begin(), e => e.code === '22023')
}))
test('paid orders remain paid and consumed when expiry runs again', () => paymentSession(async ({ attach, claim, record, elapse, expire, receipt }) => {
  await attach(); await claim(); await record(); await elapse()
  assert.equal(await expire(), 0)
  assert.equal((await rows('select status from public.orders where id=$1', [receipt.orderId]))[0].status, 'PAID')
}))
test('ordinary buyer cannot invoke privileged reservation expiry', () => session(buyer, () => denied('select public.expire_checkout_reservations(1)')))

test('database-owner scheduler releases once without a user JWT and preserves history', () => paymentSession(async ({ receipt, elapse }) => {
  await elapse()
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub','',true)")
  assert.equal((await rows('select private.expire_checkout_reservations(100) as n'))[0].n, 1)
  assert.equal((await rows('select private.expire_checkout_reservations(100) as n'))[0].n, 0)
  assert.deepEqual((await rows('select physical_quantity,reserved_quantity from public.inventory where artwork_id=$1', [art]))[0], { physical_quantity: 2, reserved_quantity: 1 })
  assert.equal((await rows('select status from public.orders where id=$1', [receipt.orderId]))[0].status, 'CANCELLED')
  assert.equal((await rows("select actor_id from public.order_events where order_id=$1 and event_type='CANCELLED'", [receipt.orderId]))[0].actor_id, null)
}))

test('scheduler preserves REVIEW payment hold after the reservation deadline', () => paymentSession(async ({ p, elapse }) => {
  await db.query("update public.payments set gateway_phase='REVIEW' where id=$1", [p.id])
  await elapse()
  await db.exec('reset role')
  assert.equal((await rows('select private.expire_checkout_reservations(100) as n'))[0].n, 0)
  assert.equal((await rows('select reserved_quantity from public.inventory where artwork_id=$1', [art]))[0].reserved_quantity, 2)
}))

test('failure can retry the same provider order; out-of-order failure cannot undo payment', () => paymentSession(async ({ attach, begin, claim, record }) => {
  await attach()
  assert.equal((await record('failed', 'failure-event', 'pay_failed'))[0].status, 'FAILED')
  assert.equal((await rows("select provider_payment_id from public.payment_events where provider_event_id='failure-event'"))[0].provider_payment_id, 'pay_failed')
  assert.equal((await begin()).provider_order_id, 'order_testProvider')
  await claim(); await record()
  assert.equal((await record('failed', 'late-failure-event', 'pay_failed'))[0].status, 'SUCCEEDED')
}))

test('webhook event ID collision with a different payload is rejected', () => paymentSession(async ({ attach, claim, record }) => {
  await attach(); await claim(); await record()
  await assert.rejects(record('captured', 'test-event-1', 'pay_testCaptured', 'd'.repeat(64)), e => e.code === '22023')
}))

test('repeated refund events retain review rather than reporting an earlier payment success', () => paymentSession(async ({ attach, claim, record }) => {
  await attach(); await claim(); await record()
  assert.equal((await record('refunded', 'refund-event'))[0].status, 'REVIEW')
  assert.equal((await record('refunded', 'refund-event'))[0].status, 'REVIEW')
}))

test('buyer cannot forge a payment record or read another buyers test payment', () => paymentSession(async ({ p }) => {
  await db.exec('set local role authenticated')
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [other])
  assert.equal((await rows('select id from public.payments where id=$1', [p.id])).length, 0)
  await denied("update public.payments set status='SUCCEEDED' where id=$1", [p.id])
}))

test('checkout uses authoritative prices, reserves once and preserves an idempotent receipt', async () => {
 await session(buyer,async()=>{
  const sql='select public.create_checkout_order($1::uuid[],$2::uuid,$3) as receipt'
  const params=[[art],address,'checkout-safe-key-0001']
  const first=(await rows(sql,params))[0].receipt
  assert.equal(first.amount,10000)
  assert.equal(first.status,'PAYMENT_PENDING')
  assert.deepEqual((await rows(sql,params))[0].receipt,first)
  assert.equal((await rows('select count(*)::int as n from public.cart_items where cart_id=$1',[cart]))[0].n,0)
  assert.equal((await rows('select count(*)::int as n from public.orders where id=$1',[first.orderId]))[0].n,1)
 })
})
test('checkout rejects another buyer address without consuming cart', async()=>{
 await session(other,async()=>{
  await assert.rejects(db.query('select public.create_checkout_order($1::uuid[],$2::uuid,$3)',[[art2],address,'checkout-forged-address']),e=>e.code==='42501')
 })
 assert.equal((await rows('select quantity from public.cart_items where cart_id=$1',[otherCart]))[0].quantity,1)
})

test('checkout denies signed-out and admin callers', async () => {
  for (const [uid, role] of [[null, 'anon'], [admin, 'authenticated']]) {
    await session(uid, () => denied('select public.create_checkout_order($1::uuid[],$2::uuid,$3)',
      [[art], address, 'unauthorized-checkout-key']), role)
  }
})

test('an unavailable cart entry remains removable by its buyer only', async () => {
  await db.exec('begin')
  try {
    await db.query("update public.artworks set status='SUSPENDED' where id=$1", [art])
    await db.exec('set local role authenticated')
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [other])
    assert.equal((await rows('delete from public.cart_items where cart_id=$1 returning id', [cart])).length, 0)
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [buyer])
    assert.equal((await rows('delete from public.cart_items where cart_id=$1 returning id', [cart])).length, 1)
  } finally { await db.exec('rollback') }
})

test('duplicate artwork entries cannot be inserted into a buyer cart', () => session(buyer, () =>
  denied('insert into public.cart_items(cart_id,artwork_id,quantity) values ($1,$2,1)', [cart, art])))
test('unsigned and customer moderation are denied even with forged metadata',async()=>{
 await session(null,()=>denied("select public.moderate_artwork($1,'PUBLISHED')",[draft]),'anon')
 await session(buyer,()=>denied("select public.moderate_artwork($1,'PUBLISHED')",[draft]),'authenticated',{role:'SUPER_ADMIN'})
})
test('admin publishes only a submitted artwork with stored image and audits the decision',async()=>{
 await db.exec('begin')
 try {
  await db.query("update public.artworks set status='SUBMITTED' where id=$1",[art])
  await db.exec('set local role authenticated')
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[admin])
  await db.query("select public.moderate_artwork($1,'PUBLISHED')",[art])
  assert.equal((await rows('select status from public.artworks where id=$1',[art]))[0].status,'PUBLISHED')
  assert.equal((await rows("select count(*)::int as n from public.admin_logs where target_id=$1 and action='ARTWORK_PUBLISHED'",[art]))[0].n,1)
  await assert.rejects(db.query("select public.moderate_artwork($1,'PUBLISHED')",[art]),e=>e.code==='22023')
 } finally {await db.exec('rollback')}
})
test('seller stock cannot be reduced below reservations or edit another seller inventory',async()=>{
 await session(seller,()=>assert.rejects(db.query('select public.set_artwork_inventory($1,0)',[art]),e=>e.code==='22023'))
 await session(seller,()=>denied('select public.set_artwork_inventory($1,5)',[art2]))
})

test('all migrations execute and all 36 application tables have RLS and UUID primary keys', async () => {
  const tables = await rows("select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r'")
  assert.equal(tables.length, publicTables.length + 3)
  assert.ok(tables.every(t => t.relrowsecurity))
  const keys = await rows("select t.typname from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace join pg_attribute a on a.attrelid=r.oid and a.attnum=c.conkey[1] join pg_type t on t.oid=a.atttypid where c.contype='p' and n.nspname in ('public','private')")
  assert.equal(keys.length, 36)
  assert.ok(keys.every(k => k.typname === 'uuid'))
})
test('signup ignores forged role metadata and atomically creates CUSTOMER profile', async () => {
  assert.equal((await rows('select role from private.user_roles where id=$1', [buyer]))[0].role, 'CUSTOMER')
  assert.equal((await rows('select id from public.profiles where id=$1', [buyer])).length, 1)
})
test('anonymous sees only published artworks and public artists/categories', () => session(null, async () => {
  assert.equal((await rows('select * from public.artworks')).length, 2)
  assert.equal((await rows('select * from public.artist_profiles')).length, 1)
  assert.equal((await rows('select * from public.categories')).length, 1)
}, 'anon'))
test('anonymous private profile access denied', () => session(null, () => denied('select * from public.profiles'), 'anon'))
test('own profile editable; another profile hidden', () => session(buyer, async () => {
  assert.equal((await rows('select * from public.profiles')).length, 1)
  await db.query('update public.profiles set display_name=$1 where id=$2', ['Buyer Name', buyer])
  assert.equal((await rows('select * from public.profiles where id=$1', [other])).length, 0)
}))
test('protected role table cannot be promoted by browser', () => session(buyer, () => denied("update private.user_roles set role='SUPER_ADMIN' where id=$1", [buyer])))
test('migration provenance is not readable by browser', () => session(seller, () => denied('select * from private.firebase_migration_records')))
test('migration provenance cannot be forged by seller', () => session(seller, () => denied("update public.seller_profiles set legacy_review_source_sha256=repeat('a',64) where id=$1", [seller])))
test('forged JWT role hint does not grant admin audit access', () => session(buyer, async () => {
  assert.equal((await rows('select public.current_app_role() as role'))[0].role, 'CUSTOMER')
  assert.equal((await rows('select * from public.admin_logs')).length, 0)
}, 'authenticated', { role: 'SUPER_ADMIN', user_metadata: { role: 'ADMIN' } }))
for (const uid of [admin, superAdmin]) {
  test('trusted admin audit read ' + uid, () => session(uid, async () => assert.equal((await rows('select * from public.admin_logs')).length, 1)))
}
test('seller sees own draft, customer cannot', async () => {
  await session(seller, async () => assert.equal((await rows('select * from public.artworks where id=$1', [draft])).length, 1))
  await session(buyer, async () => assert.equal((await rows('select * from public.artworks where id=$1', [draft])).length, 0))
})
  test('seller cannot edit another seller artwork, including through the protected RPC', async () => {
    await session(seller2, () => denied('update public.artworks set title=$1 where id=$2', ['Forged', draft]))
    await session(seller2, () => denied("select public.save_artwork($1,'EDIT',$2::jsonb)", [draft, JSON.stringify({ title: 'Forged', description: '', category: 'painting', price: 10000, inventoryCount: 1, tags: [] })]))
  })
  test('seller edits own draft through RPC while direct writes and direct publishing are denied', async () => {
    await session(seller, () => denied('update public.artworks set title=$1 where id=$2', ['Updated', draft]))
    await session(seller, async () => {
      await db.query("select public.save_artwork($1,'EDIT',$2::jsonb)", [draft, JSON.stringify({ title: 'Updated', description: '', category: 'painting', price: 10000, inventoryCount: 1, tags: [] })])
      assert.equal((await rows('select title from public.artworks where id=$1', [draft]))[0].title, 'Updated')
    })
    await session(seller, () => denied("update public.artworks set status='PUBLISHED' where id=$1", [draft]))
  })
test('buyer cannot approve a seller application', () => session(buyer, () => denied("update public.seller_profiles set status='APPROVED' where id=$1", [seller])))
test('cart and address reads are owner-only', () => session(buyer, async () => {
  assert.equal((await rows('select * from public.carts')).length, 1)
  assert.equal((await rows('select * from public.cart_items')).length, 1)
  assert.equal((await rows('select * from public.addresses')).length, 1)
}))
test('cannot insert into another buyer cart', () => session(buyer, () => denied('insert into public.cart_items(cart_id,artwork_id,quantity) values ($1,$2,1)', [otherCart, art])))
test('address ownership cannot be reassigned', () => session(buyer, () => denied('update public.addresses set user_id=$1 where id=$2', [other, address])))
test('one default address per buyer enforced', () => session(buyer, () => denied("insert into public.addresses(user_id,full_name,address_line1,city,state,postal_code,country,is_default) values ($1,'Buyer Two','456 Example','City','State','12345','India',true)", [buyer])))
for (const table of ['wishlist_items', 'likes']) {
  test(table + ' own insert works and duplicate is rejected', () => session(buyer, async () => {
    await db.query('insert into public.' + table + '(user_id,artwork_id) values ($1,$2)', [buyer, art])
    await denied('insert into public.' + table + '(user_id,artwork_id) values ($1,$2)', [buyer, art])
  }))
  test(table + ' forged owner denied', () => session(buyer, () => denied('insert into public.' + table + '(user_id,artwork_id) values ($1,$2)', [other, art])))
}
test('follows cannot forge user identity', () => session(buyer, () => denied('insert into public.follows(user_id,artist_id) values ($1,$2)', [other, seller])))
test('buyer history can read own reservation display fields and related snapshots', () => session(buyer, async () => {
  assert.equal((await rows('select status,expires_at from public.inventory_reservations where order_item_id=$1', [item])).length, 1)
  assert.equal((await rows('select * from public.orders where id=$1', [order])).length, 1)
  assert.equal((await rows('select * from public.order_items where order_id=$1', [order])).length, 2)
  assert.equal((await rows('select * from public.order_addresses where order_id=$1', [order])).length, 1)
  await rows('select * from public.order_events where order_id=$1', [order])
  await rows('select * from public.payments where order_id=$1', [order])
}))
test('other buyers and sellers cannot read buyer reservation facts', async () => {
  for (const uid of [other, seller, admin]) await session(uid, async () => {
    assert.equal((await rows('select status,expires_at from public.inventory_reservations')).length, 0)
  })
})
test('anonymous callers cannot read private orders or reservations', async () => {
  await session(null, () => denied('select * from public.orders'), 'anon')
  await session(null, () => denied('select status,expires_at from public.inventory_reservations'), 'anon')
})
test('reservation display grants do not expose other reservation columns', () => session(buyer, () => denied('select * from public.inventory_reservations')))

test('buyer order privacy; admin has no blanket private-order read', async () => {
  await session(buyer, async () => assert.equal((await rows('select * from public.orders')).length, 1))
  for (const uid of [other, seller, admin]) await session(uid, async () => assert.equal((await rows('select * from public.orders')).length, 0))
})
test('seller sees only their own order item and restricted summary', () => session(seller, async () => {
  assert.equal((await rows('select * from public.order_items')).length, 1)
  assert.equal((await rows('select * from public.order_addresses')).length, 0)
  const result = await rows('select * from public.get_seller_orders()')
  assert.equal(result.length, 1)
  assert.equal(result[0].item_id, item)
  assert.deepEqual(Object.keys(result[0]).sort(), ['order_id','item_id','title','quantity','subtotal_minor','status','payment_state','created_at'].sort())
}))
test('customer cannot use seller summary to read orders', () => session(buyer, async () => assert.equal((await rows('select * from public.get_seller_orders()')).length, 0)))
for (const [name, sql] of [
  ['order creation', "insert into public.orders(buyer_id,subtotal_minor,total_minor) values ('" + buyer + "',100,100)"],
  ['paid order', "update public.orders set status='PAID', payment_state='PAID'"],
  ['stock reservation', 'update public.inventory set reserved_quantity=0'],
  ['reservation mutation', "update public.inventory_reservations set status='RELEASED'"],
  ['payment success', "update public.payments set status='SUCCEEDED'"],
  ['fake provider event', "delete from public.payment_events"],
  ['forged admin log', 'delete from public.admin_logs'],
  ['forged AR readiness', "update public.artwork_ar_assets set status='READY'"],
  ['forged assistant output', "update public.ai_messages set content='Fake'"],
]) test('browser denied ' + name, () => session(admin, () => denied(sql)))
test('inventory check rejects reserved stock above physical stock', async () => {
  await assert.rejects(db.query('update public.inventory set reserved_quantity=3 where artwork_id=$1', [art]), e => e.code === '23514')
})
test('foreign key rejects item with wrong seller', async () => {
  await assert.rejects(db.query('insert into public.order_items(order_id,artwork_id,seller_id,title,unit_price_minor,quantity) values ($1,$2,$3,$4,100,1)',
    [order, draft, seller2, 'Wrong seller']), e => e.code === '23503')
})
test('source hash mismatch hides AR readiness', async () => {
  await db.exec('begin')
  try {
    await db.query("update public.artwork_images set source_sha256=repeat('c',64) where id=$1", [image])
    await db.exec('set local role anon')
    assert.equal((await rows('select * from public.artwork_ar_assets')).length, 0)
    assert.equal((await rows("select * from storage.objects where bucket_id='ar-assets'")).length, 0)
  } finally { await db.exec('rollback') }
})
test('private Storage buckets expose only eligible published assets', () => session(null, async () => {
  assert.equal((await rows('select * from storage.objects')).length, 2)
}, 'anon'))
test('seller cannot replace/delete reserved image bytes', () => session(seller, async () => {
  assert.equal((await rows('delete from storage.objects where name=$1 returning id', [path])).length, 0)
  await denied("insert into storage.objects(bucket_id,name) values ('artwork-images',$1)", [path + '/forged'])
}))
test('AI messages are visible only to conversation owner', async () => {
  await session(buyer, async () => assert.equal((await rows('select * from public.ai_messages')).length, 1))
  await session(other, async () => assert.equal((await rows('select * from public.ai_messages')).length, 0))
})
test('private buckets and helper search paths remain hardened', async () => {
  assert.ok((await rows('select public from storage.buckets')).every(b => !b.public))
  const helpers = await rows("select p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.prosecdef")
  assert.ok(helpers.length >= 5)
  assert.ok(helpers.every(h => h.proconfig?.some(c => c.startsWith('search_path='))))
})
test('suspension hides images and AR objects from public reads', async () => {
  await db.exec('begin')
  try {
    await db.query("update public.artworks set status='SUSPENDED' where id=$1", [art])
    await db.exec('set local role anon')
    assert.equal((await rows('select * from public.artwork_images')).length, 0)
    assert.equal((await rows('select * from public.artwork_ar_assets')).length, 0)
    assert.equal((await rows('select * from storage.objects')).length, 0)
  } finally { await db.exec('rollback') }
})
test('rejected seller record requires a non-null reason', async () => {
  await assert.rejects(db.query("update public.seller_profiles set status='REJECTED', rejection_reason=null where id=$1", [seller]), e => e.code === '23514')
})
test('client cannot replace an immutable order-item price', () => session(buyer, () => denied('update public.order_items set unit_price_minor=100 where id=$1', [item])))
test('checkout idempotency key is unique per buyer', async () => {
  await db.exec('begin')
  try {
    await db.query("insert into private.checkout_requests(buyer_id,idempotency_key,request_sha256,order_id) values ($1,'same-request-key-123',repeat('a',64),$2)", [buyer, order])
    const secondOrder = id(99)
    await db.query('insert into public.orders(id,buyer_id,subtotal_minor,total_minor) values ($1,$2,100,100)', [secondOrder, buyer])
    await assert.rejects(db.query("insert into private.checkout_requests(buyer_id,idempotency_key,request_sha256,order_id) values ($1,'same-request-key-123',repeat('a',64),$2)", [buyer, secondOrder]), e => e.code === '23505' && e.constraint.includes('idempotency_key'))
  } finally { await db.exec('rollback') }
})

test('Module 4: buyer and seller cannot access admin dashboard metrics or oversight RPCs', async () => {
  for (const uid of [buyer, seller]) {
    await session(uid, () => denied('select public.get_admin_dashboard_metrics()'))
    await session(uid, () => denied('select * from public.get_admin_users()'))
    await session(uid, () => denied('select * from public.get_admin_orders()'))
    await session(uid, () => denied('select * from public.get_admin_payments()'))
    await session(uid, () => denied('select * from public.get_admin_logs()'))
  }
})

test('Module 4: admin receives real dashboard metrics', () => session(admin, async () => {
  const [metrics] = await rows('select public.get_admin_dashboard_metrics() as m')
  assert.ok(metrics.m.totalUsers >= 2)
  assert.ok(metrics.m.totalSellers >= 2)
  assert.ok(metrics.m.totalArtworks >= 3)
  assert.ok(metrics.m.publishedArtworks >= 2)
}))

test('Module 4: admin can inspect users, orders, payments, and audit logs', () => session(admin, async () => {
  const users = await rows('select * from public.get_admin_users()')
  assert.ok(users.length >= 2)
  assert.ok(users.some(u => u.id === buyer && u.role === 'CUSTOMER'))
  assert.ok(users.some(u => u.id === seller && u.role === 'SELLER'))

  const orders = await rows('select * from public.get_admin_orders()')
  assert.ok(orders.some(o => o.id === order && o.buyer_id === buyer))

  const logs = await rows('select * from public.get_admin_logs()')
  assert.ok(logs.length >= 1)
}))

test('Module 4: user moderation enforces security rules and records audit states', async () => {
  await db.exec('begin')
  try {
    await session(buyer, () => denied("select public.moderate_user($1, 'SUSPENDED', 'Spam')", [other]))
    await session(admin, () => denied("select public.moderate_user($1, 'SUSPENDED', 'Self')", [admin]))
    await session(admin, () => denied("select public.moderate_user($1, 'SUSPENDED', 'Super')", [superAdmin]))

    await session(admin, async () => {
      await db.query("select public.moderate_user($1, 'SUSPENDED', 'Policy violation')", [other])
      const [p] = await rows('select status, suspension_reason from public.profiles where id=$1', [other])
      assert.equal(p.status, 'SUSPENDED')
      assert.equal(p.suspension_reason, 'Policy violation')

      const [log] = await rows("select * from public.admin_logs where target_id=$1 and action='USER_SUSPENDED' order by occurred_at desc limit 1", [other])
      assert.equal(log.actor_id, admin)
      assert.equal(log.previous_state, 'ACTIVE')
      assert.equal(log.new_state, 'SUSPENDED')
      assert.equal(log.reason, 'Policy violation')

      await db.query("select public.moderate_user($1, 'ACTIVE')", [other])
      const [restored] = await rows('select status, suspension_reason from public.profiles where id=$1', [other])
      assert.equal(restored.status, 'ACTIVE')
      assert.equal(restored.suspension_reason, null)
    })
  } finally { await db.exec('rollback') }
})

test('Module 4: seller suspension and reinstatement by admin', async () => {
  await db.exec('begin')
  try {
    await session(buyer, () => denied("select public.review_seller($1, 'SUSPENDED', 'No reason')", [seller]))

    await session(admin, async () => {
      await db.query("select public.review_seller($1, 'SUSPENDED', 'Suspicious activity')", [seller])
      const [s] = await rows('select status, rejection_reason from public.seller_profiles where id=$1', [seller])
      assert.equal(s.status, 'SUSPENDED')
      assert.equal(s.rejection_reason, 'Suspicious activity')

      const [log] = await rows("select * from public.admin_logs where target_id=$1 and action='SELLER_SUSPENDED' order by occurred_at desc limit 1", [seller])
      assert.equal(log.previous_state, 'APPROVED')
      assert.equal(log.new_state, 'SUSPENDED')

      const sellers = await rows('select * from public.seller_profiles')
      assert.ok(sellers.length >= 2)

      await db.query("select public.review_seller($1, 'APPROVED')", [seller])
      const [reinstated] = await rows('select status from public.seller_profiles where id=$1', [seller])
      assert.equal(reinstated.status, 'APPROVED')
    })
  } finally { await db.exec('rollback') }
})

test('Module 4: artwork suspension and restoration by admin', async () => {
  await db.exec('begin')
  try {
    await session(buyer, () => denied("select public.moderate_artwork($1, 'SUSPENDED', 'Copyright')", [art]))

    await session(admin, async () => {
      await db.query("select public.moderate_artwork($1, 'SUSPENDED', 'DMCA notice')", [art])
      const [a] = await rows('select status, rejection_reason from public.artworks where id=$1', [art])
      assert.equal(a.status, 'SUSPENDED')
      assert.equal(a.rejection_reason, 'DMCA notice')

      const [log] = await rows("select * from public.admin_logs where target_id=$1 and action='ARTWORK_SUSPENDED' order by occurred_at desc limit 1", [art])
      assert.equal(log.previous_state, 'PUBLISHED')
      assert.equal(log.new_state, 'SUSPENDED')

      await db.query("select public.moderate_artwork($1, 'RESTORE')", [art])
      const [restored] = await rows('select status from public.artworks where id=$1', [art])
      assert.equal(restored.status, 'PUBLISHED')

      const [restoreLog] = await rows("select * from public.admin_logs where target_id=$1 and action='ARTWORK_RESTORE' order by occurred_at desc limit 1", [art])
      assert.equal(restoreLog.previous_state, 'SUSPENDED')
      assert.equal(restoreLog.new_state, 'PUBLISHED')
    })
  } finally { await db.exec('rollback') }
})

test('Module 4: role assignment restricted to SUPER_ADMIN; prevents self-demotion and escalation', async () => {
  await db.exec('begin')
  try {
    await session(buyer, () => denied("select public.set_user_role($1, 'ADMIN')", [other]))
    await session(admin, () => denied("select public.set_user_role($1, 'SUPER_ADMIN')", [admin]))
    await session(superAdmin, () => denied("select public.set_user_role($1, 'CUSTOMER')", [superAdmin]))

    await session(superAdmin, async () => {
      await db.query("select public.set_user_role($1, 'ADMIN')", [other])
      const [log] = await rows("select * from public.admin_logs where target_id=$1 and action='ROLE_CHANGE' order by occurred_at desc limit 1", [other])
      assert.equal(log.actor_id, superAdmin)
      assert.equal(log.previous_state, 'CUSTOMER')
      assert.equal(log.new_state, 'ADMIN')

      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [other])
      assert.equal((await rows('select public.current_app_role() as role'))[0].role, 'ADMIN')
    })
  } finally { await db.exec('rollback') }
})
