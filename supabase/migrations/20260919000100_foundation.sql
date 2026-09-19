-- ArtVault Supabase foundation. Unapplied: no Firebase data or UI is changed.
-- New empty Supabase project only, after owner approval. No business RPCs yet.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create type public.app_role as enum ('CUSTOMER','SELLER','ADMIN','SUPER_ADMIN');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete restrict,
 display_name text check (char_length(display_name) between 2 and 80),
 phone text check (char_length(phone) <= 20), bio text check (char_length(bio) <= 500),
 photo_path text, profile_completed boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant all on public.profiles to service_role;

create table public.seller_profiles (
 id uuid primary key references public.profiles(id) on delete restrict,
 business_name text not null check (char_length(business_name) between 2 and 80),
 description text not null check (char_length(description) between 10 and 500),
 contact_email text not null check (char_length(contact_email) between 3 and 254),
 status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
 reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, rejection_reason text,
 check ((status = 'PENDING' and reviewed_at is null and reviewed_by is null and rejection_reason is null)
 or (status = 'APPROVED' and reviewed_at is not null and reviewed_by is not null and rejection_reason is null)
 or (status = 'REJECTED' and reviewed_at is not null and reviewed_by is not null and rejection_reason is not null and length(trim(rejection_reason)) > 0)),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.seller_profiles enable row level security;
revoke all on public.seller_profiles from public, anon, authenticated;
grant all on public.seller_profiles to service_role;

create table public.artist_profiles (
 id uuid primary key references public.seller_profiles(id) on delete restrict,
 display_name text not null check (char_length(display_name) between 2 and 80),
 bio text not null check (char_length(bio) between 10 and 500),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.artist_profiles enable row level security;
revoke all on public.artist_profiles from public, anon, authenticated;
grant all on public.artist_profiles to service_role;

create table public.categories (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check (slug ~ '^[a-z][a-z0-9-]{0,49}$'),
 name text not null check (char_length(name) between 1 and 80),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.categories enable row level security;
revoke all on public.categories from public, anon, authenticated;
grant all on public.categories to service_role;

create table public.artworks (
 id uuid primary key default gen_random_uuid(),
 seller_id uuid not null references public.seller_profiles(id) on delete restrict,
 category_id uuid not null references public.categories(id) on delete restrict,
 title text not null check (char_length(title) between 1 and 200),
 description text not null default '' check (char_length(description) <= 10000),
 price_minor bigint not null check (price_minor between 100 and 9007199254740991),
 currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
 status text not null default 'DRAFT' check (status in ('DRAFT','SUBMITTED','PUBLISHED','REJECTED','SUSPENDED')),
 reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, rejection_reason text,
 unique (id, seller_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.artworks enable row level security;
revoke all on public.artworks from public, anon, authenticated;
grant all on public.artworks to service_role;

create table public.artwork_images (
 id uuid primary key default gen_random_uuid(),
 artwork_id uuid not null references public.artworks(id) on delete restrict,
 bucket_id text not null default 'artwork-images' check (bucket_id = 'artwork-images'),
 object_path text not null unique check (object_path <> '' and object_path !~ '(^/|\\.\\.)'),
 position integer not null check (position between 0 and 5),
 content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
 byte_size bigint not null check (byte_size between 1 and 10485760),
 pixel_width integer check (pixel_width > 0), pixel_height integer check (pixel_height > 0),
 source_sha256 text check (source_sha256 ~ '^[a-f0-9]{64}$'),
 unique (artwork_id, position), unique (id, artwork_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.artwork_images enable row level security;
revoke all on public.artwork_images from public, anon, authenticated;
grant all on public.artwork_images to service_role;

create table public.inventory (
 id uuid primary key default gen_random_uuid(),
 artwork_id uuid not null unique references public.artworks(id) on delete restrict,
 physical_quantity integer not null default 0 check (physical_quantity >= 0),
 reserved_quantity integer not null default 0 check (reserved_quantity >= 0 and reserved_quantity <= physical_quantity),
 available_quantity integer generated always as (physical_quantity - reserved_quantity) stored,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.inventory enable row level security;
revoke all on public.inventory from public, anon, authenticated;
grant all on public.inventory to service_role;

create table public.carts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.carts enable row level security;
revoke all on public.carts from public, anon, authenticated;
grant all on public.carts to service_role;

create table public.cart_items (
 id uuid primary key default gen_random_uuid(),
 cart_id uuid not null references public.carts(id) on delete cascade,
 artwork_id uuid not null references public.artworks(id) on delete restrict,
 quantity integer not null check (quantity between 1 and 99), unique (cart_id, artwork_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.cart_items enable row level security;
revoke all on public.cart_items from public, anon, authenticated;
grant all on public.cart_items to service_role;

create table public.wishlist_items (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 artwork_id uuid not null references public.artworks(id) on delete restrict, unique (user_id, artwork_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.wishlist_items enable row level security;
revoke all on public.wishlist_items from public, anon, authenticated;
grant all on public.wishlist_items to service_role;

create table public.likes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 artwork_id uuid not null references public.artworks(id) on delete restrict, unique (user_id, artwork_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.likes enable row level security;
revoke all on public.likes from public, anon, authenticated;
grant all on public.likes to service_role;

create table public.follows (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 artist_id uuid not null references public.artist_profiles(id) on delete cascade,
 unique (user_id, artist_id), check (user_id <> artist_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.follows enable row level security;
revoke all on public.follows from public, anon, authenticated;
grant all on public.follows to service_role;

create table public.addresses (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 full_name text not null check (char_length(full_name) between 2 and 80),
 address_line1 text not null check (char_length(address_line1) between 3 and 120),
 address_line2 text check (char_length(address_line2) <= 120),
 city text not null check (char_length(city) between 2 and 60),
 state text not null check (char_length(state) between 2 and 60),
 postal_code text not null check (postal_code ~ '^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$'),
 country text not null check (char_length(country) between 2 and 60),
 phone text check (char_length(phone) <= 20), is_default boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.addresses enable row level security;
revoke all on public.addresses from public, anon, authenticated;
grant all on public.addresses to service_role;

create table public.orders (
 id uuid primary key default gen_random_uuid(),
 buyer_id uuid not null references public.profiles(id) on delete restrict,
 status text not null default 'PAYMENT_PENDING' check (status in
 ('CREATED','PAYMENT_PENDING','PAID','SELLER_CONFIRMED','PROCESSING','PACKED','SHIPPED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED','REFUND_REQUESTED','REFUNDED','DELIVERY_FAILED')),
 payment_state text not null default 'PENDING' check (payment_state in ('PENDING','PAID','FAILED','REFUNDED')),
 currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
 subtotal_minor bigint not null check (subtotal_minor between 0 and 9007199254740991),
 shipping_minor bigint check (shipping_minor >= 0), tax_minor bigint check (tax_minor >= 0),
 total_minor bigint not null check (total_minor between 0 and 9007199254740991),
 pricing_state text not null default 'ITEMS_ONLY' check (pricing_state in ('ITEMS_ONLY','FINAL')),
 cancellation_reason text, unique (id, buyer_id),
 check ((pricing_state = 'ITEMS_ONLY' and shipping_minor is null and tax_minor is null and total_minor = subtotal_minor)
 or (pricing_state = 'FINAL' and shipping_minor is not null and tax_minor is not null and total_minor = subtotal_minor + shipping_minor + tax_minor)),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.orders enable row level security;
revoke all on public.orders from public, anon, authenticated;
grant all on public.orders to service_role;

create table public.order_addresses (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null unique references public.orders(id) on delete restrict,
 full_name text not null, address_line1 text not null, address_line2 text,
 city text not null, state text not null, postal_code text not null, country text not null, phone text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.order_addresses enable row level security;
revoke all on public.order_addresses from public, anon, authenticated;
grant all on public.order_addresses to service_role;

create table public.order_items (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete restrict,
 artwork_id uuid not null, seller_id uuid not null,
 title text not null, seller_display_name text, image_path text,
 unit_price_minor bigint not null check (unit_price_minor between 100 and 9007199254740991),
 quantity integer not null check (quantity between 1 and 99),
 subtotal_minor bigint generated always as (unit_price_minor * quantity) stored check (subtotal_minor <= 9007199254740991),
 foreign key (artwork_id, seller_id) references public.artworks(id, seller_id) on delete restrict,
 unique (order_id, artwork_id), unique (id, artwork_id), unique (id, order_id, seller_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.order_items enable row level security;
revoke all on public.order_items from public, anon, authenticated;
grant all on public.order_items to service_role;

create table public.inventory_reservations (
 id uuid primary key default gen_random_uuid(),
 order_item_id uuid not null unique, artwork_id uuid not null references public.inventory(artwork_id) on delete restrict,
 quantity integer not null check (quantity between 1 and 99),
 status text not null default 'ACTIVE' check (status in ('ACTIVE','RELEASED','CONSUMED')),
 expires_at timestamptz not null, released_at timestamptz, consumed_at timestamptz,
 foreign key (order_item_id, artwork_id) references public.order_items(id, artwork_id) on delete restrict,
 check ((status = 'ACTIVE' and released_at is null and consumed_at is null)
 or (status = 'RELEASED' and released_at is not null and consumed_at is null)
 or (status = 'CONSUMED' and consumed_at is not null and released_at is null)),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.inventory_reservations enable row level security;
revoke all on public.inventory_reservations from public, anon, authenticated;
grant all on public.inventory_reservations to service_role;

create table public.order_events (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete restrict,
 sequence integer not null check (sequence > 0), event_type text not null,
 actor_id uuid references public.profiles(id) on delete restrict, occurred_at timestamptz not null default now(),
 unique (order_id, sequence),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.order_events enable row level security;
revoke all on public.order_events from public, anon, authenticated;
grant all on public.order_events to service_role;

create table public.payments (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete restrict,
 provider text not null, provider_payment_id text, idempotency_key text not null unique,
 amount_minor bigint not null check (amount_minor > 0), currency text not null check (currency ~ '^[A-Z]{3}$'),
 status text not null default 'PENDING' check (status in ('PENDING','SUCCEEDED','FAILED','CANCELLED','REFUNDED','PARTIALLY_REFUNDED')),
 unique (provider, provider_payment_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.payments enable row level security;
revoke all on public.payments from public, anon, authenticated;
grant all on public.payments to service_role;

create table public.payment_events (
 id uuid primary key default gen_random_uuid(),
 payment_id uuid references public.payments(id) on delete restrict,
 provider text not null, provider_event_id text not null, event_type text not null,
 payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
 verified_at timestamptz not null, processed_at timestamptz, unique (provider, provider_event_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.payment_events enable row level security;
revoke all on public.payment_events from public, anon, authenticated;
grant all on public.payment_events to service_role;

create table public.refunds (
 id uuid primary key default gen_random_uuid(),
 payment_id uuid not null references public.payments(id) on delete restrict,
 provider_refund_id text, amount_minor bigint not null check (amount_minor > 0),
 status text not null default 'PENDING' check (status in ('PENDING','SUCCEEDED','FAILED')),
 reason text, idempotency_key text not null unique, unique (payment_id, provider_refund_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.refunds enable row level security;
revoke all on public.refunds from public, anon, authenticated;
grant all on public.refunds to service_role;

create table public.shipments (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id) on delete restrict,
 seller_id uuid not null references public.seller_profiles(id) on delete restrict,
 carrier text, tracking_number text,
 status text not null default 'PENDING' check (status in ('PENDING','PACKED','SHIPPED','OUT_FOR_DELIVERY','DELIVERED','DELIVERY_FAILED','CANCELLED')),
 shipped_at timestamptz, delivered_at timestamptz, unique (id, order_id, seller_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.shipments enable row level security;
revoke all on public.shipments from public, anon, authenticated;
grant all on public.shipments to service_role;

create table public.shipment_items (
 id uuid primary key default gen_random_uuid(),
 shipment_id uuid not null, order_item_id uuid not null, order_id uuid not null, seller_id uuid not null,
 quantity integer not null check (quantity > 0),
 foreign key (shipment_id, order_id, seller_id) references public.shipments(id, order_id, seller_id) on delete restrict,
 foreign key (order_item_id, order_id, seller_id) references public.order_items(id, order_id, seller_id) on delete restrict,
 unique (shipment_id, order_item_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.shipment_items enable row level security;
revoke all on public.shipment_items from public, anon, authenticated;
grant all on public.shipment_items to service_role;

create table public.auctions (
 id uuid primary key default gen_random_uuid(),
 starts_at timestamptz not null, ends_at timestamptz not null check (ends_at > starts_at),
 status text not null default 'DRAFT' check (status in ('DRAFT','SCHEDULED','LIVE','ENDED','FINALIZED','CANCELLED')),
 currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'), finalized_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.auctions enable row level security;
revoke all on public.auctions from public, anon, authenticated;
grant all on public.auctions to service_role;

create table public.auction_items (
 id uuid primary key default gen_random_uuid(),
 auction_id uuid not null references public.auctions(id) on delete restrict,
 artwork_id uuid not null, seller_id uuid not null,
 quantity integer not null default 1 check (quantity > 0),
 starting_bid_minor bigint not null check (starting_bid_minor > 0),
 bid_increment_minor bigint not null check (bid_increment_minor > 0),
 foreign key (artwork_id, seller_id) references public.artworks(id, seller_id) on delete restrict,
 unique (auction_id, artwork_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.auction_items enable row level security;
revoke all on public.auction_items from public, anon, authenticated;
grant all on public.auction_items to service_role;

create table public.bids (
 id uuid primary key default gen_random_uuid(),
 auction_item_id uuid not null references public.auction_items(id) on delete restrict,
 bidder_id uuid not null references public.profiles(id) on delete restrict,
 amount_minor bigint not null check (amount_minor > 0),
 idempotency_key text not null, placed_at timestamptz not null default now(),
 unique (bidder_id, idempotency_key),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.bids enable row level security;
revoke all on public.bids from public, anon, authenticated;
grant all on public.bids to service_role;

create table public.notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null, title text not null, body text not null, read_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant all on public.notifications to service_role;

create table public.admin_logs (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null references public.profiles(id) on delete restrict,
 action text not null, target_type text not null, target_id uuid not null,
 reason text, occurred_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.admin_logs enable row level security;
revoke all on public.admin_logs from public, anon, authenticated;
grant all on public.admin_logs to service_role;

create table public.artwork_ar_assets (
 id uuid primary key default gen_random_uuid(),
 artwork_id uuid not null, image_id uuid not null,
 width_mm integer not null check (width_mm between 1 and 10000),
 height_mm integer not null check (height_mm between 1 and 10000),
 includes_frame boolean not null, measured_by uuid not null references public.profiles(id),
 source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
 model_sha256 text not null check (model_sha256 ~ '^[a-f0-9]{64}$'),
 generator_version text not null, format text not null check (format in ('GLB','USDZ')),
 bucket_id text not null default 'ar-assets' check (bucket_id = 'ar-assets'),
 object_path text not null unique,
 status text not null default 'PENDING' check (status in ('PENDING','READY','STALE','FAILED')),
 foreign key (image_id, artwork_id) references public.artwork_images(id, artwork_id) on delete restrict,
 unique (artwork_id, model_sha256),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.artwork_ar_assets enable row level security;
revoke all on public.artwork_ar_assets from public, anon, authenticated;
grant all on public.artwork_ar_assets to service_role;

create table public.artwork_analyses (
 id uuid primary key default gen_random_uuid(),
 artwork_id uuid not null unique references public.artworks(id) on delete restrict,
 source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
 provider text not null, model text not null, description text, style text, composition text, emotion text,
 artistic_score_percent numeric check (artistic_score_percent between 0 and 100),
 style_match_percent numeric check (style_match_percent between 0 and 100),
 color_palette text, color_match_percent numeric check (color_match_percent between 0 and 100),
 composition_match_percent numeric check (composition_match_percent between 0 and 100),
 emotion_match_percent numeric check (emotion_match_percent between 0 and 100),
 notable_elements text[] not null default '{}',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.artwork_analyses enable row level security;
revoke all on public.artwork_analyses from public, anon, authenticated;
grant all on public.artwork_analyses to service_role;

create table public.ai_conversations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 title text not null default 'Conversation' check (char_length(title) between 1 and 200),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.ai_conversations enable row level security;
revoke all on public.ai_conversations from public, anon, authenticated;
grant all on public.ai_conversations to service_role;

create table public.ai_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
 sequence integer not null check (sequence > 0),
 role text not null check (role in ('USER','ASSISTANT','SYSTEM')),
 content text not null check (char_length(content) between 1 and 20000),
 provider text, model text, unique (conversation_id, sequence),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.ai_messages enable row level security;
revoke all on public.ai_messages from public, anon, authenticated;
grant all on public.ai_messages to service_role;

create table public.artwork_tags (
 id uuid primary key default gen_random_uuid(),
 artwork_id uuid not null references public.artworks(id) on delete cascade,
 tag text not null check (char_length(tag) between 1 and 50), unique (artwork_id, tag),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.artwork_tags enable row level security;
revoke all on public.artwork_tags from public, anon, authenticated;
grant all on public.artwork_tags to service_role;

create table private.user_roles (
 id uuid primary key references public.profiles(id) on delete restrict,
 role public.app_role not null default 'CUSTOMER',
 assigned_by uuid references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table private.checkout_requests (
 id uuid primary key default gen_random_uuid(),
 buyer_id uuid not null references public.profiles(id),
 idempotency_key text not null check (char_length(idempotency_key) between 16 and 128),
 request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
 order_id uuid not null unique references public.orders(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (buyer_id, idempotency_key),
 foreign key (order_id, buyer_id) references public.orders(id, buyer_id)
);
alter table private.user_roles enable row level security;
alter table private.checkout_requests enable row level security;
revoke all on all tables in schema private from public, anon, authenticated;
grant usage on schema private to service_role;
grant all on all tables in schema private to service_role;

create unique index addresses_one_default on public.addresses(user_id) where is_default;
create index artworks_public_newest on public.artworks(created_at desc, id) where status = 'PUBLISHED';
create index artworks_public_price on public.artworks(price_minor, id) where status = 'PUBLISHED';
create index artworks_public_category on public.artworks(category_id, price_minor, id) where status = 'PUBLISHED';
create index artworks_seller_status on public.artworks(seller_id, status, created_at desc);
create index orders_buyer_date on public.orders(buyer_id, created_at desc);
create index reservations_due on public.inventory_reservations(expires_at, id) where status = 'ACTIVE';
create index seller_review_queue on public.seller_profiles(created_at, id) where status = 'PENDING';
create index bids_item_amount on public.bids(auction_item_id, amount_minor desc, placed_at);
create index notifications_unread on public.notifications(user_id, created_at desc) where read_at is null;
create index auctions_schedule on public.auctions(starts_at, ends_at);
-- Index all FK column groups; includes owner lookups used by RLS.
do $$
declare fk record;
begin
 for fk in
   select c.conrelid::regclass as tbl, c.conname,
     string_agg(quote_ident(a.attname), ', ' order by k.ord) as cols
   from pg_constraint c
   join pg_class t on t.oid = c.conrelid
   join pg_namespace n on n.oid = t.relnamespace
   cross join lateral unnest(c.conkey) with ordinality k(attnum, ord)
   join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
   where c.contype = 'f' and n.nspname in ('public','private')
   group by c.conrelid, c.conname
 loop
   execute format('create index %I on %s (%s)', 'fk_' || fk.conname, fk.tbl, fk.cols);
 end loop;
end $$;

create function private.touch_updated_at() returns trigger language plpgsql
set search_path = '' as $$
begin
 new.updated_at = now();
 return new;
end $$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;
create trigger touch_updated_at before update on public.profiles for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.seller_profiles for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.artist_profiles for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.categories for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.artworks for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.artwork_images for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.inventory for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.carts for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.cart_items for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.wishlist_items for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.likes for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.follows for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.addresses for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.orders for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.order_addresses for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.order_items for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.inventory_reservations for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.order_events for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.payments for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.payment_events for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.refunds for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.shipments for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.shipment_items for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.auctions for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.auction_items for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.bids for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.notifications for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.admin_logs for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.artwork_ar_assets for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.artwork_analyses for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.ai_conversations for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.ai_messages for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.artwork_tags for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on private.user_roles for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on private.checkout_requests for each row execute function private.touch_updated_at();
commit;
