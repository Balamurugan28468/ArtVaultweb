// Browser-smoke fixture ONLY. The dedicated QA server aliases the client to
// this module; production Vite configuration never imports it. No SDK/network.
const role = sessionStorage.getItem('qa-role') ?? 'guest'
const ids = { CUSTOMER: '00000000-0000-4000-8000-000000000001', SELLER: '00000000-0000-4000-8000-000000000003', ADMIN: '00000000-0000-4000-8000-000000000005', SUPER_ADMIN: '00000000-0000-4000-8000-000000000006' }
const seller = ids.SELLER
const artId = '00000000-0000-4000-8000-000000000011'
const orderId = '00000000-0000-4000-8000-000000000020'
const now = '2026-10-24T00:00:00Z'
const user = ids[role] ? { id: ids[role], email: 'fixture@example.test', email_confirmed_at: now, created_at: now, user_metadata: { display_name: `QA ${role}` } } : null
const art = { id: artId, seller_id: seller, title: 'QA Mountain Painting', description: 'Isolated browser fixture artwork.', status: 'PUBLISHED', category: 'painting', price_minor: 550000, physical_quantity: 1, reserved_quantity: 0, created_at: now, updated_at: now, like_count: 0, tags: ['mountains'], images: [{ id: 'fixture-image', path: `${seller}/${artId}/image`, contentType: 'image/png', size: 100, order: 0 }] }
const order = { id: orderId, buyer_id: ids.CUSTOMER, status: 'PAID', payment_state: 'PAID', payment_mode: 'TEST', subtotal_minor: 550000, total_minor: 550000, currency: 'INR', created_at: now, updated_at: now }
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#1d4555"/><path d="M0 300L180 40L400 300" fill="#a7b6b2"/></svg>')
const audit = { reads: [], deniedWrites: [], unsupported: [] }
window.__artvaultQa = audit
const ok = data => ({ data, error: null })
const deny = name => { audit.deniedWrites.push(name); return { data: null, error: { code: '42501', message: 'QA fixture is read-only' } } }

function tableRows(table) {
  if (table === 'artwork_catalog') return [art]
  if (table === 'profiles') return user ? [{ id: user.id, display_name: `QA ${role}`, status: 'ACTIVE', created_at: now, updated_at: now }] : []
  if (table === 'seller_profiles') return [{ id: seller, business_name: 'QA Studio', description: 'Isolated seller fixture', contact_email: 'seller@example.test', status: 'APPROVED', created_at: now, updated_at: now }]
  if (table === 'artist_profiles') return [{ id: seller, display_name: 'QA Artist', bio: 'Fixture artist biography', created_at: now, updated_at: now }]
  if (table === 'carts') return user ? [{ id: 'fixture-cart', user_id: user.id }] : []
  if (table === 'cart_items') return role === 'CUSTOMER' ? [{ id: 'fixture-cart-item', cart_id: 'fixture-cart', artwork_id: artId, quantity: 1 }] : []
  if (table === 'addresses') return role === 'CUSTOMER' ? [{ id: '00000000-0000-4000-8000-000000000032', user_id: user.id, full_name: 'QA Buyer', address_line1: '123 Example Street', address_line2: '', city: 'Chennai', state: 'Tamil Nadu', postal_code: '600001', country: 'India', phone: '', is_default: true, created_at: now, updated_at: now }] : []
  if (table === 'orders') return role === 'CUSTOMER' ? [order] : []
  if (table === 'order_items') return role === 'CUSTOMER' ? [{ id: 'fixture-item', order_id: orderId, artwork_id: artId, seller_id: seller, title: art.title, image_path: art.images[0].path, unit_price_minor: 550000, subtotal_minor: 550000, quantity: 1 }] : []
  if (['cart_items','wishlist_items','likes','follows','addresses','order_addresses','order_events','inventory_reservations','payments','artwork_analyses','artwork_ar_assets'].includes(table)) return []
  audit.unsupported.push(table)
  return []
}
function from(table) {
  let rows = tableRows(table), single = false, write = false
  const builder = {
    select: () => builder, order: () => builder, limit: n => { rows = rows.slice(0, n); return builder },
    eq: (key, value) => { rows = rows.filter(row => row[key] === value); return builder },
    in: (key, values) => { rows = rows.filter(row => values.includes(row[key])); return builder },
    gte: (key, value) => { rows = rows.filter(row => row[key] >= value); return builder },
    lte: (key, value) => { rows = rows.filter(row => row[key] <= value); return builder },
    ilike: (key, value) => { rows = rows.filter(row => String(row[key]).toLowerCase().includes(value.replaceAll('%', '').toLowerCase())); return builder },
    or: () => builder,
    maybeSingle: () => { single = true; return builder }, single: () => { single = true; return builder },
    insert: () => { write = true; return builder }, update: () => { write = true; return builder }, delete: () => { write = true; return builder }, upsert: () => { write = true; return builder },
    then: (resolve, reject) => { audit.reads.push(table); return Promise.resolve(write ? deny(table) : ok(single ? rows[0] ?? null : rows)).then(resolve, reject) },
  }
  return builder
}
const client = {
  auth: {
    getSession: async () => ok({ session: user ? { user } : null }),
    getUser: async () => ok({ user }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ok(null),
  },
  from,
  rpc: async (name) => {
    audit.reads.push(name)
    if (name === 'current_app_role') return ok(role === 'guest' ? null : role)
    if (['get_public_auctions','get_auction_bid_history','get_seller_auction_items','get_seller_fulfillment_orders','get_admin_users','get_admin_orders','get_admin_payments','get_admin_logs','get_admin_auctions','get_assistant_history','list_addresses'].includes(name)) return ok([])
    if (name === 'get_weekly_selections') return ok({ config: { enabled: false, timezone: 'Asia/Kolkata', weekday: 0, local_start: '19:00', duration_hours: 2, candidate_limit: 100 }, runs: [], candidates: [] })
    if (name === 'get_artwork_recommendations') return ok({ method: 'HEURISTIC', asOf: now, personalized: false, nextOffset: null, items: [{ score: 30, reason: 'New artwork discovery', artwork: art }] })
    if (name === 'get_admin_dashboard_metrics') return ok({ total_users: 6, total_sellers: 1, total_artworks: 1, total_orders: 1, total_revenue: 0, pending_sellers: 0, submitted_artworks: 0, recent_orders: [], recent_artworks: [] })
    audit.unsupported.push(name)
    return deny(name)
  },
  storage: { from: () => ({ createSignedUrl: async () => ok({ signedUrl: image }) }) },
  channel: () => { const channel = { on: () => channel, subscribe: callback => { queueMicrotask(() => callback?.('SUBSCRIBED')); return channel } }; return channel },
  removeChannel: async () => 'ok',
}
export const createClient = () => client
export const createRegistrationClient = () => client
