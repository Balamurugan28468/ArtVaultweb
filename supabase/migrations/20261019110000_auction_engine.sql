-- Module 5 — Weekly Auction Engine
-- Extends the existing auction_items/bids schema with settlement columns,
-- adds secure RPC bidding (row-locked, server-authoritative), pg_cron job
-- for automatic lot closing, winner checkout RPC, and admin/seller RPCs.
-- Preserves all existing rows, RLS, and Modules 1-4 behaviour.
begin;

-- ============================================================
-- 1. Schema extensions — auction_items settlement columns
-- ============================================================
-- Per-lot settlement state (parent auctions.status = lifecycle event)
alter table public.auction_items
  add column if not exists lot_status text not null default 'OPEN'
    check (lot_status in ('OPEN','WINNER_PENDING','SETTLED','NO_BIDS','PAYMENT_EXPIRED')),
  add column if not exists winner_bidder_id uuid references public.profiles(id) on delete restrict,
  add column if not exists winning_bid_minor bigint,
  add column if not exists winner_order_id uuid references public.orders(id) on delete restrict,
  add column if not exists payment_window_hours integer not null default 24,
  add column if not exists payment_window_expires_at timestamptz;

-- ============================================================
-- 2. Schema extensions — orders.auction_item_id
-- ============================================================
-- Nullable: existing orders stay NULL; winner orders reference the lot.
alter table public.orders
  add column if not exists auction_item_id uuid references public.auction_items(id) on delete restrict;

-- ============================================================
-- 3. Replace get_public_auctions() — include new lot columns
-- ============================================================
drop function if exists public.get_public_auctions();
create or replace function public.get_public_auctions()
returns table(
  id uuid,
  auction_item_id uuid,
  artwork_id uuid,
  seller_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  auction_status text,
  lot_status text,
  starting_bid_minor bigint,
  bid_increment_minor bigint,
  current_high_bid bigint,
  bid_count bigint,
  winner_bidder_id uuid,
  winning_bid_minor bigint,
  payment_window_expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    a.id,
    i.id as auction_item_id,
    i.artwork_id,
    i.seller_id,
    a.starts_at,
    a.ends_at,
    a.status as auction_status,
    i.lot_status,
    i.starting_bid_minor,
    i.bid_increment_minor,
    max(b.amount_minor) as current_high_bid,
    count(b.id) as bid_count,
    i.winner_bidder_id,
    i.winning_bid_minor,
    i.payment_window_expires_at,
    a.created_at,
    a.updated_at
  from public.auctions a
  join public.auction_items i on i.auction_id = a.id
  left join public.bids b on b.auction_item_id = i.id
  where a.status in ('SCHEDULED','LIVE','ENDED','FINALIZED')
  group by a.id, i.id, i.artwork_id, i.seller_id, a.starts_at, a.ends_at, a.status,
           i.lot_status, i.starting_bid_minor, i.bid_increment_minor,
           i.winner_bidder_id, i.winning_bid_minor, i.payment_window_expires_at,
           a.created_at, a.updated_at
  order by a.starts_at asc, i.id asc
  limit 200;
$$;
revoke all on function public.get_public_auctions() from public, anon, authenticated;
grant execute on function public.get_public_auctions() to anon, authenticated;

-- ============================================================
-- 4. get_auction_bid_history — public bid amounts, no identity
-- ============================================================
create or replace function public.get_auction_bid_history(p_auction_item_id uuid)
returns table(
  bid_id uuid,
  amount_minor bigint,
  placed_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select b.id as bid_id, b.amount_minor, b.placed_at
  from public.bids b
  join public.auction_items i on i.id = b.auction_item_id
  join public.auctions a on a.id = i.auction_id
  where b.auction_item_id = p_auction_item_id
    and a.status in ('LIVE','ENDED','FINALIZED')
  order by b.amount_minor desc, b.placed_at asc
  limit 100;
$$;
revoke all on function public.get_auction_bid_history(uuid) from public, anon, authenticated;
grant execute on function public.get_auction_bid_history(uuid) to anon, authenticated;

-- ============================================================
-- 5. place_bid — transactional, row-locked, server-authoritative
-- ============================================================
-- Returns: 'ok' | 'auction_not_live' | 'lot_not_open' | 'bid_too_low'
--          | 'seller_cannot_bid' | 'already_highest' | 'duplicate_key'
create or replace function public.place_bid(
  p_auction_item_id uuid,
  p_amount_minor bigint,
  p_idempotency_key text
)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_lot record;
  v_auction record;
  v_current_high bigint;
  v_min_next bigint;
begin
  -- Must be authenticated
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Lock the auction_item row (prevents concurrent bids racing)
  select i.* into v_lot
  from public.auction_items i
  where i.id = p_auction_item_id
  for update;

  if not found then
    raise exception 'Auction lot not found' using errcode = 'P0002';
  end if;

  -- Seller cannot bid on own artwork
  if v_lot.seller_id = v_uid then
    return 'seller_cannot_bid';
  end if;

  -- Lot must be OPEN
  if v_lot.lot_status <> 'OPEN' then
    return 'lot_not_open';
  end if;

  -- Parent auction must be LIVE
  select a.* into v_auction
  from public.auctions a
  where a.id = v_lot.auction_id;

  if v_auction.status <> 'LIVE' then
    return 'auction_not_live';
  end if;

  -- Auction end time must not have passed (defense-in-depth; cron closes lots)
  if now() >= v_auction.ends_at then
    return 'auction_not_live';
  end if;

  -- Compute current high bid (within same lock)
  select coalesce(max(b.amount_minor), 0) into v_current_high
  from public.bids b
  where b.auction_item_id = p_auction_item_id;

  -- Minimum next bid
  if v_current_high = 0 then
    v_min_next := v_lot.starting_bid_minor;
  else
    v_min_next := v_current_high + v_lot.bid_increment_minor;
  end if;

  if p_amount_minor < v_min_next then
    return 'bid_too_low';
  end if;

  -- Insert bid (idempotency_key prevents double-submission)
  begin
    insert into public.bids(auction_item_id, bidder_id, amount_minor, idempotency_key)
    values (p_auction_item_id, v_uid, p_amount_minor, p_idempotency_key);
  exception
    when unique_violation then
      return 'duplicate_key';
  end;

  return 'ok';
end $$;
revoke all on function public.place_bid(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.place_bid(uuid, bigint, text) to authenticated;

-- ============================================================
-- 6. private.close_auction_lots — idempotent lot closing (cron target)
-- ============================================================
create or replace function private.close_auction_lots(batch_size integer default 50)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_lot record;
  v_high_bid record;
  v_closed integer := 0;
  v_auction_id uuid;
begin
  if batch_size is null or batch_size not between 1 and 200 then
    raise exception 'Invalid batch size' using errcode = '22023';
  end if;

  -- Find LIVE auctions whose end time has passed
  for v_lot in
    select i.id, i.auction_id, i.seller_id, i.artwork_id,
           i.starting_bid_minor, i.bid_increment_minor, i.payment_window_hours,
           a.ends_at
    from public.auction_items i
    join public.auctions a on a.id = i.auction_id
    where i.lot_status = 'OPEN'
      and a.status = 'LIVE'
      and a.ends_at <= now()
    order by i.id
    limit batch_size
    for update of i skip locked
  loop
    -- Find highest bid for this lot
    select b.bidder_id, b.amount_minor into v_high_bid
    from public.bids b
    where b.auction_item_id = v_lot.id
    order by b.amount_minor desc, b.placed_at asc
    limit 1;

    if found then
      -- We have a winner
      update public.auction_items
      set lot_status = 'WINNER_PENDING',
          winner_bidder_id = v_high_bid.bidder_id,
          winning_bid_minor = v_high_bid.amount_minor,
          payment_window_expires_at = now() + (payment_window_hours || ' hours')::interval
      where id = v_lot.id;
    else
      -- No bids — lot ends with no winner
      update public.auction_items
      set lot_status = 'NO_BIDS'
      where id = v_lot.id;

      -- Release inventory hold (if any reserved_quantity was held)
      -- artwork remains in PUBLISHED state; no hold was placed for NO_BIDS case
    end if;

    v_closed := v_closed + 1;

    -- Check if all lots in this auction are now closed; if so, mark auction ENDED
    v_auction_id := v_lot.auction_id;
    if not exists (
      select 1 from public.auction_items
      where auction_id = v_auction_id and lot_status = 'OPEN'
    ) then
      update public.auctions
      set status = 'ENDED'
      where id = v_auction_id and status = 'LIVE';
    end if;
  end loop;

  -- Also expire WINNER_PENDING lots whose payment window has passed
  for v_lot in
    select i.id, i.auction_id, i.artwork_id
    from public.auction_items i
    where i.lot_status = 'WINNER_PENDING'
      and i.payment_window_expires_at <= now()
    order by i.id
    limit batch_size
    for update of i skip locked
  loop
    update public.auction_items
    set lot_status = 'PAYMENT_EXPIRED'
    where id = v_lot.id;

    -- Cancel any un-paid winner order if it exists
    update public.orders
    set status = 'CANCELLED',
        cancellation_reason = 'AUCTION_PAYMENT_WINDOW_EXPIRED'
    where auction_item_id = v_lot.id
      and status in ('CREATED','PAYMENT_PENDING');

    v_closed := v_closed + 1;
  end loop;

  return v_closed;
end $$;
revoke all on function private.close_auction_lots(integer) from public, anon, authenticated, service_role;

-- Public operator wrapper (ADMIN/SUPER_ADMIN only)
create or replace function public.close_auction_lots(batch_size integer default 50)
returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return private.close_auction_lots(batch_size);
end $$;
revoke all on function public.close_auction_lots(integer) from public, anon;
grant execute on function public.close_auction_lots(integer) to authenticated;

-- ============================================================
-- 7. Register cron job — closes lots every minute
-- ============================================================
select cron.schedule('artvault-close-auction-lots', '* * * * *',
  'select private.close_auction_lots(50);');

-- ============================================================
-- 8. create_auction_winner_order — winner-only checkout
-- ============================================================
-- Creates an order for the winning bid amount. Winner must be authenticated.
-- Prevents double-settlement via row lock + lot_status check.
create or replace function public.create_auction_winner_order(
  p_auction_item_id uuid,
  p_shipping_address_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_lot record;
  v_artwork record;
  v_inv record;
  v_order_id uuid;
  v_item_id uuid;
  v_res_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Lock the lot row
  select i.* into v_lot
  from public.auction_items i
  where i.id = p_auction_item_id
  for update;

  if not found then
    raise exception 'Auction lot not found' using errcode = 'P0002';
  end if;

  -- Must be the winner
  if v_lot.winner_bidder_id <> v_uid then
    raise exception 'Only the auction winner may create a winner order' using errcode = '42501';
  end if;

  -- Lot must still be WINNER_PENDING
  if v_lot.lot_status <> 'WINNER_PENDING' then
    raise exception 'Auction lot is not awaiting winner payment (status: %)', v_lot.lot_status
      using errcode = 'P0001';
  end if;

  -- Payment window must not have expired
  if v_lot.payment_window_expires_at <= now() then
    raise exception 'Payment window has expired' using errcode = 'P0001';
  end if;

  -- Artwork details
  select w.id, w.seller_id, w.title,
         coalesce(img.object_path, '') as image_path
  into v_artwork
  from public.artworks w
  left join lateral (
    select object_path from public.artwork_images
    where artwork_id = w.id
    order by position, id
    limit 1
  ) img on true
  where w.id = v_lot.artwork_id;

  if not found then
    raise exception 'Artwork not found' using errcode = 'P0002';
  end if;

  -- Inventory — lock and check availability
  select inv.* into v_inv
  from public.inventory inv
  where inv.artwork_id = v_lot.artwork_id
  for update;

  if not found or v_inv.available_quantity < v_lot.quantity then
    raise exception 'Insufficient inventory for auction lot' using errcode = 'P0001';
  end if;

  -- Create order (total = winning bid, no shipping/tax yet: ITEMS_ONLY)
  insert into public.orders(
    buyer_id, status, payment_state, currency,
    subtotal_minor, total_minor, pricing_state, auction_item_id
  )
  values (
    v_uid, 'CREATED', 'PENDING', 'INR',
    v_lot.winning_bid_minor, v_lot.winning_bid_minor, 'ITEMS_ONLY', p_auction_item_id
  )
  returning id into v_order_id;

  -- Order item at winning bid price
  insert into public.order_items(
    order_id, artwork_id, seller_id, title, image_path,
    unit_price_minor, quantity
  )
  values (
    v_order_id, v_lot.artwork_id, v_artwork.seller_id, v_artwork.title, v_artwork.image_path,
    v_lot.winning_bid_minor, v_lot.quantity
  )
  returning id into v_item_id;

  -- Reserve inventory
  update public.inventory
  set reserved_quantity = reserved_quantity + v_lot.quantity
  where artwork_id = v_lot.artwork_id;

  insert into public.inventory_reservations(
    order_item_id, artwork_id, quantity,
    status, expires_at
  )
  values (
    v_item_id, v_lot.artwork_id, v_lot.quantity,
    'ACTIVE', v_lot.payment_window_expires_at
  )
  returning id into v_res_id;

  -- Mark lot as having a winner order
  update public.auction_items
  set winner_order_id = v_order_id
  where id = p_auction_item_id;

  -- Order event
  insert into public.order_events(order_id, sequence, event_type, actor_id)
  values (v_order_id, 1, 'CREATED', v_uid);

  return v_order_id;
end $$;
revoke all on function public.create_auction_winner_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_auction_winner_order(uuid, uuid) to authenticated;

-- ============================================================
-- 9. get_seller_auction_items — seller's own lots
-- ============================================================
create or replace function public.get_seller_auction_items()
returns table(
  id uuid,
  auction_id uuid,
  artwork_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  auction_status text,
  lot_status text,
  starting_bid_minor bigint,
  bid_increment_minor bigint,
  current_high_bid bigint,
  bid_count bigint,
  winning_bid_minor bigint,
  payment_window_expires_at timestamptz,
  winner_order_id uuid,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    i.id,
    i.auction_id,
    i.artwork_id,
    a.starts_at,
    a.ends_at,
    a.status as auction_status,
    i.lot_status,
    i.starting_bid_minor,
    i.bid_increment_minor,
    coalesce(max(b.amount_minor), 0) as current_high_bid,
    count(b.id) as bid_count,
    i.winning_bid_minor,
    i.payment_window_expires_at,
    i.winner_order_id,
    i.created_at
  from public.auction_items i
  join public.auctions a on a.id = i.auction_id
  left join public.bids b on b.auction_item_id = i.id
  where i.seller_id = (select auth.uid())
    and private.has_role(array['SELLER']::public.app_role[])
  group by i.id, i.auction_id, i.artwork_id, a.starts_at, a.ends_at, a.status,
           i.lot_status, i.starting_bid_minor, i.bid_increment_minor,
           i.winning_bid_minor, i.payment_window_expires_at, i.winner_order_id, i.created_at
  order by a.starts_at desc, i.id asc
  limit 100;
$$;
revoke all on function public.get_seller_auction_items() from public, anon, authenticated;
grant execute on function public.get_seller_auction_items() to authenticated;

-- ============================================================
-- 10. Admin RPCs
-- ============================================================

-- get_admin_auctions — full admin view
create or replace function public.get_admin_auctions()
returns table(
  auction_id uuid,
  auction_item_id uuid,
  artwork_id uuid,
  seller_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  auction_status text,
  lot_status text,
  starting_bid_minor bigint,
  bid_increment_minor bigint,
  current_high_bid bigint,
  bid_count bigint,
  winner_bidder_id uuid,
  winning_bid_minor bigint,
  payment_window_expires_at timestamptz,
  winner_order_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    a.id as auction_id,
    i.id as auction_item_id,
    i.artwork_id,
    i.seller_id,
    a.starts_at,
    a.ends_at,
    a.status as auction_status,
    i.lot_status,
    i.starting_bid_minor,
    i.bid_increment_minor,
    coalesce(max(b.amount_minor), 0) as current_high_bid,
    count(b.id) as bid_count,
    i.winner_bidder_id,
    i.winning_bid_minor,
    i.payment_window_expires_at,
    i.winner_order_id,
    a.created_at,
    a.updated_at
  from public.auctions a
  join public.auction_items i on i.auction_id = a.id
  left join public.bids b on b.auction_item_id = i.id
  where private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[])
  group by a.id, i.id, i.artwork_id, i.seller_id, a.starts_at, a.ends_at, a.status,
           i.lot_status, i.starting_bid_minor, i.bid_increment_minor,
           i.winner_bidder_id, i.winning_bid_minor, i.payment_window_expires_at,
           i.winner_order_id, a.created_at, a.updated_at
  order by a.starts_at desc, i.id asc
  limit 500;
$$;
revoke all on function public.get_admin_auctions() from public, anon, authenticated;
grant execute on function public.get_admin_auctions() to authenticated;

-- schedule_auction_lot — admin creates a new auction + lot
create or replace function public.schedule_auction_lot(
  p_artwork_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_starting_bid_minor bigint,
  p_bid_increment_minor bigint,
  p_payment_window_hours integer default 24
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_seller_id uuid;
  v_auction_id uuid;
  v_item_id uuid;
begin
  v_uid := auth.uid();
  if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  -- Validate inputs
  if p_ends_at <= p_starts_at then
    raise exception 'ends_at must be after starts_at' using errcode = '22023';
  end if;
  if p_starts_at <= now() then
    raise exception 'starts_at must be in the future' using errcode = '22023';
  end if;
  if p_starting_bid_minor <= 0 then
    raise exception 'starting_bid_minor must be positive' using errcode = '22023';
  end if;
  if p_bid_increment_minor <= 0 then
    raise exception 'bid_increment_minor must be positive' using errcode = '22023';
  end if;
  if p_payment_window_hours not between 1 and 168 then
    raise exception 'payment_window_hours must be between 1 and 168' using errcode = '22023';
  end if;

  -- Artwork must be PUBLISHED and have inventory
  select w.seller_id into v_seller_id
  from public.artworks w
  join public.inventory inv on inv.artwork_id = w.id
  where w.id = p_artwork_id
    and w.status = 'PUBLISHED'
    and inv.available_quantity > 0;

  if not found then
    raise exception 'Artwork not found, not published, or out of stock' using errcode = 'P0002';
  end if;

  -- No overlapping/conflicting active or scheduled auction for this artwork
  if exists (
    select 1
    from public.auction_items ai
    join public.auctions a on a.id = ai.auction_id
    where ai.artwork_id = p_artwork_id
      and a.status in ('SCHEDULED', 'LIVE')
      and ai.lot_status in ('OPEN', 'WINNER_PENDING')
  ) then
    raise exception 'Artwork already has an active or scheduled auction' using errcode = '23505';
  end if;

  -- Create auction event
  insert into public.auctions(starts_at, ends_at, status, currency)
  values (p_starts_at, p_ends_at, 'SCHEDULED', 'INR')
  returning id into v_auction_id;

  -- Create lot
  insert into public.auction_items(
    auction_id, artwork_id, seller_id,
    quantity, starting_bid_minor, bid_increment_minor, payment_window_hours
  )
  values (
    v_auction_id, p_artwork_id, v_seller_id,
    1, p_starting_bid_minor, p_bid_increment_minor, p_payment_window_hours
  )
  returning id into v_item_id;

  -- Audit log
  insert into public.admin_logs(actor_id, action, target_type, target_id, reason)
  values (v_uid, 'AUCTION_SCHEDULED', 'auction_items', v_item_id, 'Admin scheduled auction lot');

  return v_item_id;
end $$;
revoke all on function public.schedule_auction_lot(uuid, timestamptz, timestamptz, bigint, bigint, integer) from public, anon, authenticated;
grant execute on function public.schedule_auction_lot(uuid, timestamptz, timestamptz, bigint, bigint, integer) to authenticated;

-- cancel_auction — admin cancels a DRAFT or SCHEDULED auction (no bids yet)
create or replace function public.cancel_auction(
  p_auction_id uuid,
  p_reason text default 'Admin cancelled'
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_auction record;
begin
  v_uid := auth.uid();
  if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select a.* into v_auction
  from public.auctions a
  where a.id = p_auction_id
  for update;

  if not found then
    raise exception 'Auction not found' using errcode = 'P0002';
  end if;

  if v_auction.status not in ('DRAFT','SCHEDULED') then
    raise exception 'Only DRAFT or SCHEDULED auctions can be cancelled (current: %)', v_auction.status
      using errcode = 'P0001';
  end if;

  -- Check no bids have been placed
  if exists (
    select 1 from public.bids b
    join public.auction_items i on i.id = b.auction_item_id
    where i.auction_id = p_auction_id
  ) then
    raise exception 'Cannot cancel an auction that already has bids' using errcode = 'P0001';
  end if;

  update public.auctions set status = 'CANCELLED' where id = p_auction_id;
  update public.auction_items set lot_status = 'NO_BIDS' where auction_id = p_auction_id and lot_status = 'OPEN';

  insert into public.admin_logs(actor_id, action, target_type, target_id, reason)
  values (v_uid, 'AUCTION_CANCELLED', 'auctions', p_auction_id, coalesce(p_reason, 'Admin cancelled'));
end $$;
revoke all on function public.cancel_auction(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_auction(uuid, text) to authenticated;

-- activate_auction — admin transitions SCHEDULED -> LIVE
create or replace function public.activate_auction(p_auction_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_auction record;
begin
  v_uid := auth.uid();
  if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select a.* into v_auction
  from public.auctions a
  where a.id = p_auction_id
  for update;

  if not found then
    raise exception 'Auction not found' using errcode = 'P0002';
  end if;

  if v_auction.status <> 'SCHEDULED' then
    raise exception 'Only SCHEDULED auctions can be activated (current: %)', v_auction.status
      using errcode = 'P0001';
  end if;

  update public.auctions set status = 'LIVE' where id = p_auction_id;

  insert into public.admin_logs(actor_id, action, target_type, target_id, reason)
  values (v_uid, 'AUCTION_ACTIVATED', 'auctions', p_auction_id, 'Admin activated auction to LIVE');
end $$;
revoke all on function public.activate_auction(uuid) from public, anon, authenticated;
grant execute on function public.activate_auction(uuid) to authenticated;

-- ============================================================
-- 11. RLS — add bid visibility for bidders on any lot
-- ============================================================
-- Extend bids_own: keep own-only for OPEN lots;
-- for ENDED/WINNER_PENDING/SETTLED lots allow own bids always.
-- (No public bid-identity exposure — use get_auction_bid_history for amounts.)
-- The existing bids_own policy using (bidder_id = auth.uid()) already covers this.
-- No change needed — bidder sees own bids on all lots.

-- Extend auctions_public to also show CANCELLED for admin auditing
-- (no change needed — admins use get_admin_auctions which bypasses RLS via SECURITY DEFINER)

-- ============================================================
-- 12. Index for efficient lot closing queries
-- ============================================================
create index if not exists auction_items_lot_status_open
  on public.auction_items(lot_status, auction_id)
  where lot_status = 'OPEN';

create index if not exists auction_items_winner_pending
  on public.auction_items(lot_status, payment_window_expires_at)
  where lot_status = 'WINNER_PENDING';

create index if not exists orders_auction_item
  on public.orders(auction_item_id)
  where auction_item_id is not null;

commit;

