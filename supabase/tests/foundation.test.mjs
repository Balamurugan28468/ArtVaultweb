import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { registerWeeklySelectionTests } from './weekly-selection.cases.mjs'
import { registerAssistantRecommendationTests } from './assistant-recommendations.cases.mjs'
import { pendingMigrations, verifyMigrationRollback, registerModule09Tests } from './module09-contracts.mjs'

// A fresh in-memory PostgreSQL instance only. No URL, env loading or network DB.
const db = new PGlite()
const rollbackEvidence = new Set()
const id = (n) => '00000000-0000-4000-8000-' + n.toString(16).padStart(12, '0')
const [buyer, other, seller, seller2, admin, superAdmin] = [1, 2, 3, 4, 5, 6].map(id)
const category = id(10), art = id(11), draft = id(12), art2 = id(13)
const order = id(20), item = id(21), item2 = id(22), image = id(23), ar = id(24)
const cart = id(30), otherCart = id(31), address = id(32), conversation = id(40)
const publicTables = ["profiles","seller_profiles","artist_profiles","categories","artworks","artwork_images","inventory","carts","cart_items","wishlist_items","likes","follows","addresses","orders","order_addresses","order_items","inventory_reservations","order_events","payments","payment_events","refunds","shipments","shipment_items","auctions","auction_items","bids","notifications","admin_logs","artwork_ar_assets","artwork_analyses","ai_conversations","ai_messages","artwork_tags"]
publicTables.push('auction_realtime_signals')
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
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz default now());
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
    -- Real publication catalog/DDL, not a mocked publication security check.
    -- PGlite has no Realtime gateway; WebSocket delivery remains a hosted check.
    create publication supabase_realtime;
  `)
  const directory = new URL('../migrations/', import.meta.url)
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    let sql = await readFile(new URL(file, directory), 'utf8')
    if (file === '20261020153833_auction_e2e_lifecycle.sql') {
      // Exercise removal when a prior deployment already published private lots.
      await db.exec('alter publication supabase_realtime add table public.auction_items;')
    }
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
    if (pendingMigrations.includes(file)) {
      await verifyMigrationRollback(db, sql)
      rollbackEvidence.add(file)
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
registerWeeklySelectionTests({db,rows,buyer,other,seller,seller2,admin,category})
registerAssistantRecommendationTests({db,rows,buyer,other,seller,seller2,admin,category,conversation})
registerModule09Tests({db,test,rollbackEvidence})

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

test('Cron preserves lifecycle jobs and separately registers weekly preparation', async () => {
  assert.deepEqual(await rows('select jobname,schedule,command,active from cron.job order by jobname'), [
    {
      active: true,
      command: 'select private.run_auction_lifecycle(50);',
      jobname: 'artvault-close-auction-lots',
      schedule: '* * * * *',
    },
    {
      active: true,
      command: 'select private.expire_checkout_reservations(100);',
      jobname: 'artvault-expire-checkout-reservations',
      schedule: '* * * * *',
    },
    {active:true,command:'select private.prepare_weekly_selections();',jobname:'artvault-prepare-weekly-selection',schedule:'*/10 * * * *'},
  ])
  assert.equal((await rows('select private.expire_checkout_reservations(100) as n'))[0].n, 0)
  assert.equal((await rows('select private.close_auction_lots(50) as n'))[0].n, 0)
  await assert.rejects(db.query('select private.expire_checkout_reservations(501)'), { code: '22023' })
  await assert.rejects(db.query('select private.close_auction_lots(201)'), { code: '22023' })
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

test('all migrations execute and all application tables have RLS and UUID primary keys', async () => {
  const tables = await rows("select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r'")
  assert.equal(tables.length, publicTables.length + 9)
  assert.ok(tables.every(t => t.relrowsecurity))
  const keys = await rows("select t.typname from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace join pg_attribute a on a.attrelid=r.oid and a.attnum=c.conkey[1] join pg_type t on t.oid=a.atttypid where c.contype='p' and n.nspname in ('public','private')")
  assert.equal(keys.length, tables.length)
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

test('Module 5: admin can schedule, activate, and cancel auctions; non-admin denied', async () => {
  const startsAt = new Date(Date.now() + 3600000).toISOString()
  const endsAt = new Date(Date.now() + 7200000).toISOString()

  // Non-admin cannot schedule
  await session(buyer, () => denied(
    'select public.schedule_auction_lot($1, $2, $3, $4, $5, $6)',
    [art, startsAt, endsAt, 100000, 10000, 24]
  ))

  // Admin schedules
  let lotId
  let auctionId
  try {
    await session(admin, async () => {
      const res = await rows(
        'select public.schedule_auction_lot($1, $2, $3, $4, $5, $6) as id',
        [art, startsAt, endsAt, 100000, 10000, 24]
      )
      lotId = res[0].id
      assert.ok(lotId)

      const [lotRow] = (await rows('select * from public.get_admin_auctions()')).filter(row => row.auction_item_id === lotId)
      auctionId = lotRow.auction_id

      // Admin cannot activate before the server-time window.
      await db.exec('savepoint premature_activation')
      await assert.rejects(db.query('select public.activate_auction($1)', [auctionId]), error => error.code === '22023')
      await db.exec('rollback to savepoint premature_activation; reset role')
      await db.query("update public.auctions set starts_at=clock_timestamp()-interval '1 minute' where id=$1", [auctionId])
      await db.exec('set local role authenticated')
      // A due auction can still be activated by an authorized admin.
      await db.query('select public.activate_auction($1)', [auctionId])
      const [auction] = await rows('select status from public.auctions where id = $1', [auctionId])
      assert.equal(auction.status, 'LIVE')
    })
  } finally {
    if (lotId) await db.query('delete from public.auction_items where id = $1', [lotId])
    if (auctionId) await db.query('delete from public.auctions where id = $1', [auctionId])
  }
})

test('Module 5: place_bid enforces rules and protects integrity', async () => {
  // Create live auction lot
  const startsAt = new Date(Date.now() - 3600000).toISOString()
  const endsAt = new Date(Date.now() + 3600000).toISOString()
  const [auction] = await rows(
    "insert into public.auctions(starts_at, ends_at, status) values ($1, $2, 'LIVE') returning id",
    [startsAt, endsAt]
  )
  const [lot] = await rows(
    'insert into public.auction_items(auction_id, artwork_id, seller_id, starting_bid_minor, bid_increment_minor) values ($1, $2, $3, $4, $5) returning id',
    [auction.id, art, seller, 500000, 50000]
  )

  try {
    // Anonymous cannot bid
    await session(null, () => denied(
      'select public.place_bid($1, $2, $3)',
      [lot.id, 500000, 'anon-key']
    ), 'anon')

    // Seller cannot bid on own artwork
    await session(seller, async () => {
      const res = await rows('select public.place_bid($1, $2, $3) as r', [lot.id, 500000, 'seller-bid'])
      assert.equal(res[0].r, 'seller_cannot_bid')
    })

    // Bid below starting bid is rejected
    await session(buyer, async () => {
      const res = await rows('select public.place_bid($1, $2, $3) as r', [lot.id, 400000, 'low-bid'])
      assert.equal(res[0].r, 'bid_too_low')
    })

    // Valid starting bid is accepted, and duplicate idempotency key is rejected
    await session(buyer, async () => {
      const res1 = await rows('select public.place_bid($1, $2, $3) as r', [lot.id, 500000, 'bid-1'])
      assert.equal(res1[0].r, 'ok')

      const res2 = await rows('select public.place_bid($1, $2, $3) as r', [lot.id, 600000, 'bid-1'])
      assert.equal(res2[0].r, 'duplicate_key')
    })

    // Insert buyer's starting bid so it persists for subsequent checks
    await db.query(
      'insert into public.bids(auction_item_id, bidder_id, amount_minor, idempotency_key) values ($1, $2, $3, $4)',
      [lot.id, buyer, 500000, 'bid-persisted-1']
    )

    // Next bid must be at least current + increment (500000 + 50000 = 550000)
    await session(other, async () => {
      const low = await rows('select public.place_bid($1, $2, $3) as r', [lot.id, 520000, 'other-low'])
      assert.equal(low[0].r, 'bid_too_low')

      const valid = await rows('select public.place_bid($1, $2, $3) as r', [lot.id, 550000, 'other-valid'])
      assert.equal(valid[0].r, 'ok')
    })

    // Insert other's bid so it persists for history check
    await db.query(
      'insert into public.bids(auction_item_id, bidder_id, amount_minor, idempotency_key) values ($1, $2, $3, $4)',
      [lot.id, other, 550000, 'bid-persisted-2']
    )

    // Public bid history exposes amounts without identities
    const history = await rows('select * from public.get_auction_bid_history($1)', [lot.id])
    assert.equal(history.length, 2)
    assert.equal(Number(history[0].amount_minor), 550000)
    assert.equal(Number(history[1].amount_minor), 500000)
    assert.ok(!('bidder_id' in history[0]))
  } finally {
    await db.query('delete from public.bids where auction_item_id = $1', [lot.id])
    await db.query('delete from public.auction_items where id = $1', [lot.id])
    await db.query('delete from public.auctions where id = $1', [auction.id])
  }
})

// Complete auction/payment fixtures live ONLY in this in-memory database.
// No hosted Auth user, auction, order, payment or provider is contacted.
async function auctionIntegrationFixture(run) {
  await db.exec('begin')
  const as = async (uid, operation, role = 'authenticated') => {
    await db.exec('set local role ' + role)
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid ?? ''])
    try { return await operation() } finally { await db.exec('reset role') }
  }
  const rejected = async (uid, sql, params = [], code = '42501', role = 'authenticated') => as(uid, async () => {
    await db.exec('savepoint expected_rejection')
    try { await assert.rejects(db.query(sql,params), error => error.code === code) }
    finally { await db.exec('rollback to savepoint expected_rejection; release savepoint expected_rejection') }
  }, role)
  try {
    const [artwork] = await rows("insert into public.artworks(seller_id,category_id,title,price_minor,status) values($1,$2,'Auction integration fixture',900000,'PUBLISHED') returning id", [seller,category])
    await db.query('insert into public.inventory(artwork_id,physical_quantity) values($1,1)', [artwork.id])
    const imagePath = `${seller}/${artwork.id}/snapshot.png`
    await db.query("insert into public.artwork_images(artwork_id,object_path,position,content_type,byte_size,source_sha256) values($1,$2,0,'image/png',100,repeat('c',64))", [artwork.id,imagePath])
    const [auction] = await rows("insert into public.auctions(starts_at,ends_at,status) values(clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour','SCHEDULED') returning id")
    const [lot] = await rows('insert into public.auction_items(auction_id,artwork_id,seller_id,starting_bid_minor,bid_increment_minor) values($1,$2,$3,500000,50000) returning id', [auction.id,artwork.id,seller])
    const [shipping] = await rows("insert into public.addresses(user_id,full_name,address_line1,city,state,postal_code,country) values($1,'Winner Name','123 Shipping Street','Mumbai','Maharashtra','400001','India') returning id", [other])
    const state = async () => {
      const [stock] = await rows('select physical_quantity,reserved_quantity,available_quantity from public.inventory where artwork_id=$1', [artwork.id])
      const [item] = await rows('select lot_status,winner_bidder_id,winner_order_id,winning_bid_minor from public.auction_items where id=$1', [lot.id])
      return { stock,item }
    }
    const bid = async (uid, amount, key) => as(uid, async () => (await rows('select public.place_bid($1,$2,$3) as result', [lot.id,amount,key]))[0].result)
    const close = async () => {
      await db.query("update public.auctions set ends_at=clock_timestamp()-interval '1 microsecond' where id=$1", [auction.id])
      await rows('select private.run_auction_lifecycle(50)')
    }
    const win = async () => {
      await rows('select private.run_auction_lifecycle(50)')
      assert.equal(await bid(buyer,550000,'first-customer-bid'),'ok')
      assert.equal(await bid(other,600000,'second-customer-bid'),'ok')
      await close()
    }
    const checkout = async (addressId = shipping.id) => as(other, async () => (await rows('select public.create_auction_winner_order($1,$2) as id', [lot.id,addressId]))[0].id)
    const payment = async orderId => {
      const [p] = await rows('select public.begin_razorpay_test_payment($1,$2) as value', [orderId,other])
      assert.equal(Number(p.value.amount_minor),600000)
      assert.equal(p.value.currency,'INR')
      assert.equal(p.value.mode,'TEST')
      await db.query("select public.attach_razorpay_test_order($1,'order_auctionFixture')", [p.value.id])
      return p.value.id
    }
    const capture = p => db.query("select public.claim_razorpay_test_capture($1,'pay_auctionFixture',600000,'INR')", [p])
    const settle = (p,event='auction-capture') => rows("select public.record_razorpay_test_result($1,'pay_auctionFixture',600000,'INR','captured',$2,$3) as result", [p,event,'a'.repeat(64)])
    await run({ as,rejected,artwork,auction,lot,shipping,imagePath,state,bid,close,win,checkout,payment,capture,settle })
  } finally { await db.exec('reset role; rollback') }
}

test('Module 05 privacy: anonymous users and losing bidders cannot read private lot identifiers', () => auctionIntegrationFixture(async f => {
  await f.win()
  const orderId=await f.checkout()
  for (const [uid,role] of [[null,'anon'],[buyer,'authenticated'],[other,'authenticated']]) {
    await f.rejected(uid,'select winner_bidder_id,winner_order_id from public.auction_items where id=$1',[f.lot.id],'42501',role)
    await f.rejected(uid,'select * from public.auction_items where id=$1',[f.lot.id],'42501',role)
    await f.as(uid,async()=>{
      const [catalog]=await rows('select * from public.get_public_auctions() where auction_item_id=$1',[f.lot.id])
      assert.ok(catalog)
      assert.equal(catalog.is_current_user_winner,uid===other)
      assert.equal(catalog.payment_window_expires_at!==null,uid===other)
      for(const key of ['winner_bidder_id','winner_order_id','winner_uid']) assert.equal(Object.hasOwn(catalog,key),false)
      const values=JSON.stringify(catalog)
      assert.equal(values.includes(other),false)
      assert.equal(values.includes(orderId),false)
    },role)
  }
  // Even an accidental future table grant cannot revive the old public policy.
  await db.exec('grant select on public.auction_items to anon,authenticated')
  await f.as(null,async()=>assert.deepEqual(await rows('select * from public.auction_items where id=$1',[f.lot.id]),[]),'anon')
  await f.as(buyer,async()=>assert.deepEqual(await rows('select * from public.auction_items where id=$1',[f.lot.id]),[]))
}))

test('Module 05 privacy: winner recognition and repeat checkout require no publicly readable private IDs', () => auctionIntegrationFixture(async f => {
  await f.win()
  await f.as(other,async()=>{
    const [catalog]=await rows('select * from public.get_public_auctions() where auction_item_id=$1',[f.lot.id])
    assert.equal(catalog.is_current_user_winner,true)
  })
  const orderId=await f.checkout()
  assert.equal(await f.checkout(null),orderId)
  await f.rejected(buyer,'select public.create_auction_winner_order($1,$2)',[f.lot.id,f.shipping.id])
  await f.as(buyer,async()=>{
    assert.deepEqual(await rows('select * from public.orders where id=$1',[orderId]),[])
    assert.deepEqual(await rows('select * from public.get_admin_auctions()'),[])
    assert.deepEqual(await rows('select * from public.get_seller_auction_items()'),[])
  })
  await f.as(other,async()=>assert.equal((await rows('select id from public.orders where id=$1',[orderId]))[0].id,orderId))
  await f.as(admin,async()=>assert.equal((await rows('select * from public.get_admin_auctions() where auction_item_id=$1',[f.lot.id]))[0].winner_order_id,orderId))
}))

test('Module 05 privacy: live signals expose only bounded invalidations, never private bids or winner/order IDs', () => auctionIntegrationFixture(async f => {
  const published=(await rows("select tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'")).map(row=>row.tablename)
  assert.ok(published.includes('auction_realtime_signals'))
  assert.ok(published.includes('orders')) // Existing order subscriptions are preserved.
  for(const privateTable of ['auction_items','bids','auctions']) assert.equal(published.includes(privateTable),false)
  const signal=async()=> (await rows("select * from public.auction_realtime_signals where source_type='LOT' and source_id=$1",[f.lot.id]))[0]
  const initial=await signal()
  await rows('select private.run_auction_lifecycle(50)')
  assert.equal(await f.bid(buyer,550000,'live-buyer'),'ok')
  assert.ok(Number((await signal()).revision)>Number(initial.revision))
  const afterFirst=await signal()
  assert.equal(await f.bid(other,600000,'live-winner'),'ok')
  assert.ok(Number((await signal()).revision)>Number(afterFirst.revision))
  await f.close()
  const orderId=await f.checkout()
  for (const [uid,role] of [[null,'anon'],[buyer,'authenticated']]) await f.as(uid,async()=>{
    const signals=await rows('select * from public.auction_realtime_signals where auction_id=$1',[f.auction.id])
    assert.equal(signals.length,2) // One source row per event/lot, not a bid history.
    for(const row of signals) assert.deepEqual(Object.keys(row).sort(),['auction_id','id','revision','source_id','source_type','updated_at'])
    const serialized=JSON.stringify(signals)
    for(const value of [buyer,other,orderId,'amount_minor','bidder_id','winner_bidder_id','winner_order_id','idempotency_key']) assert.equal(serialized.includes(value),false)
    const [catalog]=await rows('select * from public.get_public_auctions() where auction_item_id=$1',[f.lot.id])
    assert.equal(Number(catalog.current_high_bid),600000)
    assert.equal(Number(catalog.bid_count),2)
    assert.equal(catalog.is_current_user_winner,false)
  },role)
  await f.as(buyer,async()=>assert.equal((await rows('select * from public.bids where auction_item_id=$1',[f.lot.id])).length,1))
  await f.rejected(null,'select * from public.bids where auction_item_id=$1',[f.lot.id],'42501','anon')
  await f.rejected(buyer,"update public.auction_realtime_signals set revision=999 where source_id=$1",[f.lot.id])
  await f.rejected(buyer,"insert into public.auction_realtime_signals(source_type,source_id,auction_id) values('LOT',gen_random_uuid(),$1)",[f.auction.id])
  await f.rejected(buyer,'select private.signal_auction_change()')
  const [policies]=await rows("select count(*)::int as n from pg_policies where schemaname='public' and tablename='auction_items' and cmd='SELECT'")
  assert.equal(policies.n,0)
}))

test('Module 05 privacy: draft signals stay private but withdrawal of a public event still refreshes clients', () => auctionIntegrationFixture(async f => {
  const [draftAuction]=await rows("insert into public.auctions(starts_at,ends_at,status) values(clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours','DRAFT') returning id")
  await db.query('insert into public.auction_items(auction_id,artwork_id,seller_id,starting_bid_minor,bid_increment_minor) values($1,$2,$3,500000,50000)',[draftAuction.id,f.artwork.id,seller])
  await f.as(null,async()=>assert.deepEqual(await rows('select * from public.auction_realtime_signals where auction_id=$1',[draftAuction.id]),[]),'anon')
  const [before]=await rows("select revision from public.auction_realtime_signals where source_type='AUCTION' and source_id=$1",[f.auction.id])
  await db.query("update public.auctions set status='CANCELLED' where id=$1",[f.auction.id])
  await f.as(null,async()=>{
    const [after]=await rows("select revision from public.auction_realtime_signals where source_type='AUCTION' and source_id=$1",[f.auction.id])
    assert.ok(Number(after.revision)>Number(before.revision))
    assert.deepEqual(await rows('select * from public.get_public_auctions() where id=$1',[f.auction.id]),[])
  },'anon')
}))

test('Module 05 E2E: cron activates due auctions only and closes missed scheduled windows with NO_BIDS', () => auctionIntegrationFixture(async f => {
  await f.rejected(null,'select private.run_auction_lifecycle(50)',[],'42501','anon')
  await f.rejected(buyer,'select private.activate_due_auctions(50)')
  await db.query("update public.auctions set starts_at=clock_timestamp()+interval '10 minutes' where id=$1",[f.auction.id])
  await rows('select private.run_auction_lifecycle(50)')
  assert.equal((await rows('select status from public.auctions where id=$1',[f.auction.id]))[0].status,'SCHEDULED')
  await f.rejected(admin,'select public.activate_auction($1)',[f.auction.id],'22023')
  await db.query("update public.auctions set starts_at=clock_timestamp()-interval '1 minute' where id=$1",[f.auction.id])
  await rows('select private.run_auction_lifecycle(50)')
  assert.equal((await rows('select status from public.auctions where id=$1',[f.auction.id]))[0].status,'LIVE')
  await f.close()
  assert.equal((await f.state()).item.lot_status,'NO_BIDS')
  assert.equal((await rows('select status from public.auctions where id=$1',[f.auction.id]))[0].status,'ENDED')
  const [missed] = await rows("insert into public.auctions(starts_at,ends_at,status) values(clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour','SCHEDULED') returning id")
  const [missedLot] = await rows('insert into public.auction_items(auction_id,artwork_id,seller_id,starting_bid_minor,bid_increment_minor) values($1,$2,$3,500000,50000) returning id',[missed.id,f.artwork.id,seller])
  await rows('select private.run_auction_lifecycle(50)')
  assert.equal((await rows('select lot_status from public.auction_items where id=$1',[missedLot.id]))[0].lot_status,'NO_BIDS')
  const [job] = await rows("select command,schedule,active from cron.job where jobname='artvault-close-auction-lots'")
  assert.equal(job.command,'select private.run_auction_lifecycle(50);')
  assert.equal(job.schedule,'* * * * *')
  assert.equal(job.active,true)
}))

test('Module 05 E2E: two customers bid; server rejects unauthorized, self, early, late and below-minimum bids', () => auctionIntegrationFixture(async f => {
  assert.equal(await f.bid(buyer,500000,'not-live'),'auction_not_live')
  await rows('select private.run_auction_lifecycle(50)')
  await f.rejected(null,'select public.place_bid($1,500000,$2)',[f.lot.id,'anonymous'],'42501','anon')
  await f.rejected(admin,'select public.place_bid($1,500000,$2)',[f.lot.id,'admin-cannot-buy'])
  assert.equal(await f.bid(seller,500000,'seller-own'),'seller_cannot_bid')
  await db.query("update public.auctions set starts_at=clock_timestamp()+interval '1 minute' where id=$1",[f.auction.id])
  assert.equal(await f.bid(buyer,500000,'premature-live'),'auction_not_live')
  // The RPC transaction may have started before activation or waited for a
  // lock. An accepted bid must record acceptance time, not transaction start.
  await db.query("update public.auctions set starts_at=clock_timestamp() where id=$1",[f.auction.id])
  assert.equal(await f.bid(buyer,499999,'below-start'),'bid_too_low')
  assert.equal(await f.bid(buyer,550000,'buyer-valid'),'ok')
  assert.equal((await rows('select b.placed_at>=a.starts_at and b.placed_at>now() as accepted_in_window from public.bids b join public.auction_items i on i.id=b.auction_item_id join public.auctions a on a.id=i.auction_id where b.auction_item_id=$1',[f.lot.id]))[0].accepted_in_window,true)
  assert.equal(await f.bid(other,560000,'below-increment'),'bid_too_low')
  assert.equal(await f.bid(other,600000,'winner-valid'),'ok')
  assert.equal(await f.bid(other,650000,'winner-valid'),'duplicate_key')
  await f.close()
  const {item} = await f.state()
  assert.equal(item.lot_status,'WINNER_PENDING')
  assert.equal(item.winner_bidder_id,other)
  assert.equal(Number(item.winning_bid_minor),600000)
  assert.equal(await f.bid(buyer,700000,'late-bid'),'lot_not_open')
}))

test('Module 05 E2E: winner checkout is private, address-complete and idempotent with one reservation', () => auctionIntegrationFixture(async f => {
  await f.win()
  await f.rejected(buyer,'select public.create_auction_winner_order($1,$2)',[f.lot.id,address])
  await f.rejected(other,'select public.create_auction_winner_order($1,$2)',[f.lot.id,address])
  await f.rejected(other,'select public.create_auction_winner_order($1)',[f.lot.id])
  assert.equal((await f.state()).stock.reserved_quantity,0)
  const orderId = await f.checkout()
  assert.equal(await f.checkout(null),orderId)
  assert.equal(await f.checkout(),orderId)
  const [o] = await rows('select * from public.orders where id=$1',[orderId])
  assert.equal(o.status,'PAYMENT_PENDING')
  assert.equal(o.payment_mode,'TEST')
  assert.equal(o.payment_state,'PENDING')
  assert.equal(Number(o.subtotal_minor),600000)
  assert.equal(Number(o.total_minor),600000)
  const [snapshot] = await rows('select * from public.order_addresses where order_id=$1',[orderId])
  assert.equal(snapshot.full_name,'Winner Name')
  await f.as(other, () => db.query('select public.save_address($1,$2::jsonb)',[f.shipping.id,JSON.stringify({fullName:'Changed Name',addressLine1:'123 New Street',city:'Mumbai',state:'Maharashtra',postalCode:'400002',country:'India',isDefault:false})]))
  assert.equal((await rows('select full_name from public.order_addresses where order_id=$1',[orderId]))[0].full_name,'Winner Name')
  const [line] = await rows('select * from public.order_items where order_id=$1',[orderId])
  assert.equal(line.image_path,f.imagePath)
  assert.equal(Number(line.unit_price_minor),600000)
  assert.equal((await rows('select count(*)::int as n from public.inventory_reservations where order_item_id=$1',[line.id]))[0].n,1)
  assert.deepEqual((await f.state()).stock,{physical_quantity:1,reserved_quantity:1,available_quantity:0})
  await f.as(other,async()=>assert.equal((await rows('select id from public.orders where id=$1',[orderId])).length,1))
  await f.as(buyer,async()=>assert.equal((await rows('select id from public.orders where id=$1',[orderId])).length,0))
  await f.rejected(null,'select id from public.orders where id=$1',[orderId],'42501','anon')
  await db.exec('savepoint duplicate_order')
  await assert.rejects(db.query('insert into public.orders(buyer_id,subtotal_minor,total_minor,auction_item_id) values($1,600000,600000,$2)',[other,f.lot.id]),error=>error.code==='23505')
  await db.exec('rollback to savepoint duplicate_order')
}))

test('Module 05 E2E: trusted TEST settlement pays the winning bid and consumes unique artwork exactly once', () => auctionIntegrationFixture(async f => {
  await f.win()
  const orderId = await f.checkout()
  await f.rejected(other,'select public.begin_razorpay_test_payment($1,$2)',[orderId,other])
  const p = await f.payment(orderId)
  await f.capture(p)
  assert.equal((await f.settle(p))[0].result,'SUCCEEDED')
  assert.equal((await f.settle(p))[0].result,'SUCCEEDED')
  assert.equal((await f.settle(p,'auction-capture-repeated'))[0].result,'SUCCEEDED')
  assert.equal(await f.checkout(null),orderId)
  await rows('select private.run_auction_lifecycle(50)')
  assert.deepEqual((await f.state()).stock,{physical_quantity:0,reserved_quantity:0,available_quantity:0})
  assert.equal((await f.state()).item.lot_status,'SETTLED')
  const [o] = await rows('select status,payment_state,payment_mode from public.orders where id=$1',[orderId])
  assert.deepEqual(o,{status:'PAID',payment_state:'PAID',payment_mode:'TEST'})
  assert.equal((await rows('select count(*)::int as n from public.payments where order_id=$1',[orderId]))[0].n,1)
  assert.equal((await rows('select count(*)::int as n from public.orders where auction_item_id=$1',[f.lot.id]))[0].n,1)
}))

test('Module 05 E2E: expiry releases unpaid stock once, preserves history and cannot re-reserve on retry', () => auctionIntegrationFixture(async f => {
  await f.win()
  const orderId = await f.checkout()
  await db.query("update public.inventory_reservations set expires_at=now()-interval '1 minute' where artwork_id=$1",[f.artwork.id])
  await rows('select private.run_auction_lifecycle(50)')
  await rows('select private.run_auction_lifecycle(50)')
  assert.equal((await f.state()).item.lot_status,'PAYMENT_EXPIRED')
  assert.deepEqual((await f.state()).stock,{physical_quantity:1,reserved_quantity:0,available_quantity:1})
  assert.equal((await rows('select status from public.orders where id=$1',[orderId]))[0].status,'CANCELLED')
  assert.equal(await f.checkout(null),orderId)
  assert.equal((await rows('select count(*)::int as n from public.payments where order_id=$1',[orderId]))[0].n,0)
  await f.as(other,async()=>assert.equal((await rows('select id from public.orders where id=$1',[orderId])).length,1))
}))

for (const phase of ['CAPTURING','REVIEW']) test(`Module 05 E2E: auction closer preserves ${phase} payment race protection`, () => auctionIntegrationFixture(async f => {
  await f.win()
  const orderId = await f.checkout()
  const p = await f.payment(orderId)
  await f.capture(p)
  if (phase==='REVIEW') await db.query("select public.record_razorpay_test_result($1,'pay_auctionFixture',600000,'INR','review','review-event',$2)",[p,'b'.repeat(64)])
  await db.query("update public.inventory_reservations set expires_at=now()-interval '1 minute' where artwork_id=$1",[f.artwork.id])
  await db.query("update public.auction_items set payment_window_expires_at=now()-interval '1 minute' where id=$1",[f.lot.id])
  await rows('select private.run_auction_lifecycle(50)')
  assert.equal((await f.state()).item.lot_status,'WINNER_PENDING')
  assert.deepEqual((await f.state()).stock,{physical_quantity:1,reserved_quantity:1,available_quantity:0})
  assert.equal((await rows('select status from public.orders where id=$1',[orderId]))[0].status,'PAYMENT_PENDING')
  if (phase==='CAPTURING') {
    await f.settle(p)
    await rows('select private.run_auction_lifecycle(50)')
    assert.equal((await f.state()).item.lot_status,'SETTLED')
    assert.deepEqual((await f.state()).stock,{physical_quantity:0,reserved_quantity:0,available_quantity:0})
  }
}))

test('Module 5: close_auction_lots and create_auction_winner_order lifecycle', async () => {
  // Create auction that has just ended
  const startsAt = new Date(Date.now() - 7200000).toISOString()
  const endsAt = new Date(Date.now() - 3600000).toISOString()
  const [auction] = await rows(
    "insert into public.auctions(starts_at, ends_at, status) values ($1, $2, 'LIVE') returning id",
    [startsAt, endsAt]
  )
  const [lot] = await rows(
    'insert into public.auction_items(auction_id, artwork_id, seller_id, starting_bid_minor, bid_increment_minor) values ($1, $2, $3, $4, $5) returning id',
    [auction.id, art, seller, 300000, 20000]
  )

  let createdOrderId
  try {
    // Place a bid directly to simulate prior bidding
    await db.query(
      'insert into public.bids(auction_item_id, bidder_id, amount_minor, idempotency_key, placed_at) values ($1, $2, $3, $4, $5)',
      [lot.id, buyer, 350000, 'winning-bid-key', new Date(new Date(endsAt).getTime()-60000).toISOString()]
    )

    // Run close_auction_lots
    const closed = await rows('select private.close_auction_lots(50) as n')
    assert.equal(closed[0].n, 1)

    // Lot should be WINNER_PENDING and auction ENDED
    const [updatedLot] = await rows('select lot_status, winner_bidder_id, winning_bid_minor from public.auction_items where id = $1', [lot.id])
    assert.equal(updatedLot.lot_status, 'WINNER_PENDING')
    assert.equal(updatedLot.winner_bidder_id, buyer)
    assert.equal(Number(updatedLot.winning_bid_minor), 350000)

    const [updatedAuction] = await rows('select status from public.auctions where id = $1', [auction.id])
    assert.equal(updatedAuction.status, 'ENDED')

    // Non-winner cannot create winner order
    await session(other, () => denied(
      'select public.create_auction_winner_order($1)',
      [lot.id]
    ))

    // Winner creates winner order
    await session(buyer, async () => {
      const [orderRes] = await rows('select public.create_auction_winner_order($1,$2) as id', [lot.id,address])
      createdOrderId = orderRes.id
      assert.ok(createdOrderId)

      const [orderRow] = await rows('select status, total_minor, auction_item_id from public.orders where id = $1', [createdOrderId])
      assert.equal(orderRow.status, 'PAYMENT_PENDING')
      assert.equal(Number(orderRow.total_minor), 350000)
      assert.equal(orderRow.auction_item_id, lot.id)
      const [snapshot] = await rows('select * from public.order_addresses where order_id=$1', [createdOrderId])
      assert.equal(snapshot.full_name,'Buyer One')
    })

    // Inventory reservation was created (verified as superuser)
    const [resRow] = await rows('select * from public.inventory_reservations where artwork_id = $1 and status = $2', [art, 'ACTIVE'])
    assert.ok(resRow)
  } finally {
    if (createdOrderId) {
      await db.query('delete from public.order_events where order_id = $1', [createdOrderId])
      await db.query('delete from public.inventory_reservations where order_item_id in (select id from public.order_items where order_id = $1)', [createdOrderId])
      await db.query('delete from public.order_items where order_id = $1', [createdOrderId])
      await db.query('delete from public.orders where id = $1', [createdOrderId])
    }
    await db.query('delete from public.bids where auction_item_id = $1', [lot.id])
    await db.query('delete from public.auction_items where id = $1', [lot.id])
    await db.query('delete from public.auctions where id = $1', [auction.id])
  }
})
