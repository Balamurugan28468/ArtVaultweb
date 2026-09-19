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
    await db.exec(await readFile(new URL(file, directory), 'utf8'))
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
test('seller cannot edit another seller artwork', () => session(seller2, async () => {
  assert.equal((await rows('update public.artworks set title=$1 where id=$2 returning id', ['Forged', draft])).length, 0)
}))
test('seller can edit own draft but cannot publish it', async () => {
  await session(seller, async () => assert.equal((await rows('update public.artworks set title=$1 where id=$2 returning id', ['Updated', draft])).length, 1))
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
