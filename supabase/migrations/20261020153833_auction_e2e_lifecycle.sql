-- Module 05 E2E integration. No business-row backfill or deletion.
-- Existing conflicting winner orders must be reviewed, never silently merged.
begin;
do $$ begin
 if exists(select 1 from public.orders where auction_item_id is not null group by auction_item_id having count(*)>1)
 or exists(select 1 from public.auction_items i join public.orders o on o.id=i.winner_order_id
           where o.auction_item_id is distinct from i.id)
 or exists(select 1 from public.orders o where o.auction_item_id is not null and
           (o.status='CREATED' or not exists(select 1 from public.order_addresses a where a.order_id=o.id))) then
  raise exception 'Review conflicting or incomplete legacy auction winner orders before applying this migration';
 end if;
end $$;
create unique index orders_one_winner_per_lot on public.orders(auction_item_id) where auction_item_id is not null;
create index auctions_due_activation on public.auctions(starts_at,id) where status='SCHEDULED';

-- Lot rows contain private winner/order identifiers. Only trusted RPCs may
-- read them. Remove table AND any historical column grants, and default-deny
-- direct reads even if a table grant is accidentally restored in the future.
revoke select on public.auction_items from public,anon,authenticated;
do $$ declare cols text; begin
 select string_agg(format('%I',attname),',') into cols from pg_attribute
 where attrelid='public.auction_items'::regclass and attnum>0 and not attisdropped;
 execute format('revoke select (%s) on public.auction_items from public,anon,authenticated',cols);
end $$;
drop policy if exists auction_items_public on public.auction_items;

-- This un-deployed migration changes the RPC result shape deliberately: no
-- winner UUID or order UUID is returned, even to the winner. The server returns
-- only an identity-relative flag; checkout still independently authorizes uid.
drop function public.get_public_auctions();
create function public.get_public_auctions()
returns table(
 id uuid,auction_item_id uuid,artwork_id uuid,seller_id uuid,
 starts_at timestamptz,ends_at timestamptz,auction_status text,lot_status text,
 starting_bid_minor bigint,bid_increment_minor bigint,current_high_bid bigint,bid_count bigint,
 is_current_user_winner boolean,winning_bid_minor bigint,payment_window_expires_at timestamptz,
 created_at timestamptz,updated_at timestamptz
)
language sql stable security definer set search_path='' as $$
 select a.id,i.id,i.artwork_id,i.seller_id,a.starts_at,a.ends_at,a.status,i.lot_status,
  i.starting_bid_minor,i.bid_increment_minor,max(b.amount_minor),count(b.id),
  coalesce(i.winner_bidder_id=(select auth.uid()),false),i.winning_bid_minor,
  case when i.winner_bidder_id=(select auth.uid()) then i.payment_window_expires_at else null end,
  a.created_at,a.updated_at
 from public.auctions a join public.auction_items i on i.auction_id=a.id
 left join public.bids b on b.auction_item_id=i.id
 where a.status in ('SCHEDULED','LIVE','ENDED','FINALIZED')
 group by a.id,i.id
 order by a.starts_at,i.id limit 200;
$$;
revoke all on function public.get_public_auctions() from public,anon,authenticated;
grant execute on function public.get_public_auctions() to anon,authenticated;

-- Sanitized, coalesced invalidations: at most one row per auction/lot source.
-- No bid/user/order IDs, bid data, or arbitrary JSON payloads can be published.
-- These are disposable notification keys, not business relationships. In
-- particular, no parent FK lock is taken by a lot trigger: winner settlement
-- locks ORDER -> LOT, while bidding/closing lock AUCTION -> LOT. One row per
-- source also avoids a shared parent notification lock reversing that order.
create table public.auction_realtime_signals (
 id uuid primary key default gen_random_uuid(),
 source_type text not null check(source_type in ('AUCTION','LOT')),
 source_id uuid not null,
 auction_id uuid not null,
 revision bigint not null default 1 check(revision>0),
 updated_at timestamptz not null default clock_timestamp(),
 unique(source_type,source_id)
);
create index auction_realtime_signals_event on public.auction_realtime_signals(auction_id);
alter table public.auction_realtime_signals enable row level security;
revoke all on public.auction_realtime_signals from public,anon,authenticated;
grant select on public.auction_realtime_signals to anon,authenticated;
create policy auction_signals_public on public.auction_realtime_signals for select to anon,authenticated
 using(true); -- Rows are emitted only for public sources/withdrawal of public events.

create function private.signal_auction_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare event_id uuid; kind text;
begin
 if tg_table_name='auctions' then
  if new.status not in ('SCHEDULED','LIVE','ENDED','FINALIZED') and
   (tg_op<>'UPDATE' or old.status not in ('SCHEDULED','LIVE','ENDED','FINALIZED')) then return new; end if;
  event_id:=new.id; kind:='AUCTION';
 elsif tg_table_name='auction_items' then
  if not exists(select 1 from public.auctions where id=new.auction_id and status in ('SCHEDULED','LIVE','ENDED','FINALIZED')) then return new; end if;
  event_id:=new.auction_id; kind:='LOT';
 else raise exception 'Invalid auction signal source'; end if;
 insert into public.auction_realtime_signals(source_type,source_id,auction_id)
 values(kind,new.id,event_id)
 on conflict(source_type,source_id) do update
 set revision=public.auction_realtime_signals.revision+1,updated_at=clock_timestamp();
 return new;
end $$;
revoke all on function private.signal_auction_change() from public,anon,authenticated,service_role;
create trigger auction_public_signal after insert or update on public.auctions
 for each row execute function private.signal_auction_change();
create trigger auction_lot_public_signal after insert or update on public.auction_items
 for each row execute function private.signal_auction_change();

create function private.activate_due_auctions(batch_size integer default 50)
returns integer language plpgsql security definer set search_path='' as $$
declare a record; activated integer:=0;
begin
 if batch_size is null or batch_size not between 1 and 200 then raise exception 'Invalid batch size' using errcode='22023'; end if;
 for a in select id from public.auctions where status='SCHEDULED'
  and starts_at<=clock_timestamp() and ends_at>clock_timestamp()
  order by starts_at,id limit batch_size for update skip locked loop
  update public.auctions set status='LIVE' where id=a.id and status='SCHEDULED'
   and starts_at<=clock_timestamp() and ends_at>clock_timestamp();
  if found then activated:=activated+1; end if;
 end loop;
 return activated;
end $$;
revoke all on function private.activate_due_auctions(integer) from public,anon,authenticated,service_role;

create or replace function public.activate_auction(p_auction_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare a public.auctions%rowtype;
begin
 if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then
  raise exception 'Administrator access required' using errcode='42501'; end if;
 select * into a from public.auctions where id=p_auction_id for update;
 if not found or a.status<>'SCHEDULED' or a.starts_at>clock_timestamp() or a.ends_at<=clock_timestamp() then
  raise exception 'Auction must be scheduled and inside its server-time bidding window' using errcode='22023'; end if;
 update public.auctions set status='LIVE' where id=a.id;
 insert into public.admin_logs(actor_id,action,target_type,target_id,reason)
 values(auth.uid(),'AUCTION_ACTIVATED','auctions',a.id,'Admin activated a due auction');
end $$;

create or replace function public.place_bid(p_auction_item_id uuid,p_amount_minor bigint,p_idempotency_key text)
returns text language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); lot public.auction_items%rowtype; a public.auctions%rowtype; parent uuid; high bigint; accepted_at timestamptz;
begin
 if caller is null or not private.has_role(array['CUSTOMER','SELLER']::public.app_role[])
  or not exists(select 1 from public.profiles where id=caller and status='ACTIVE') then
  raise exception 'Buyer authentication required' using errcode='42501'; end if;
 if p_amount_minor is null or p_amount_minor not between 100 and 9007199254740991
  or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 then
  raise exception 'Invalid bid' using errcode='22023'; end if;
 select auction_id into parent from public.auction_items where id=p_auction_item_id;
 if not found then raise exception 'Auction lot unavailable' using errcode='42501'; end if;
 -- Parent before lot: the closer uses the same ordering. SHARE serializes
 -- cancellation/closing while allowing independent lots to receive bids.
 select * into a from public.auctions where id=parent for share;
 select * into lot from public.auction_items where id=p_auction_item_id for update;
 accepted_at:=clock_timestamp();
 if lot.seller_id=caller then return 'seller_cannot_bid'; end if;
 if lot.lot_status<>'OPEN' then return 'lot_not_open'; end if;
 if a.status<>'LIVE' or a.starts_at>accepted_at or a.ends_at<=accepted_at then return 'auction_not_live'; end if;
 if not exists(select 1 from public.artworks w join public.seller_profiles s on s.id=w.seller_id
  join public.inventory inv on inv.artwork_id=w.id where w.id=lot.artwork_id and w.status='PUBLISHED'
  and s.status='APPROVED' and inv.available_quantity>=lot.quantity) then return 'lot_not_open'; end if;
 if exists(select 1 from public.bids where bidder_id=caller and idempotency_key=p_idempotency_key) then return 'duplicate_key'; end if;
 select max(amount_minor) into high from public.bids where auction_item_id=lot.id;
 if p_amount_minor<coalesce(high+lot.bid_increment_minor,lot.starting_bid_minor) then return 'bid_too_low'; end if;
 begin
  insert into public.bids(auction_item_id,bidder_id,amount_minor,idempotency_key,placed_at)
  values(lot.id,caller,p_amount_minor,p_idempotency_key,accepted_at);
 exception when unique_violation then return 'duplicate_key'; end;
 -- The lot trigger emits only a sanitized invalidation for other bidders.
 update public.auction_items set updated_at=clock_timestamp() where id=lot.id;
 return 'ok';
end $$;

create or replace function public.create_auction_winner_order(p_auction_item_id uuid,p_shipping_address_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); lot public.auction_items%rowtype; existing public.orders%rowtype;
 art public.artworks%rowtype; shipping public.addresses%rowtype; new_order uuid; new_item uuid; stock public.inventory%rowtype;
begin
 if caller is null or not private.has_role(array['CUSTOMER','SELLER']::public.app_role[])
  or not exists(select 1 from public.profiles where id=caller and status='ACTIVE') then
  raise exception 'Buyer authentication required' using errcode='42501'; end if;
 select * into lot from public.auction_items where id=p_auction_item_id;
 if not found or lot.winner_bidder_id is distinct from caller or lot.seller_id=caller then
  raise exception 'Winner order unavailable' using errcode='42501'; end if;
 -- Serialize retries before taking any order/lot lock. For an existing order,
 -- acquire ORDER then LOT, matching payment settlement and reservation expiry.
 perform pg_advisory_xact_lock(hashtextextended('artvault-winner:'||p_auction_item_id::text,0));
 select * into existing from public.orders where auction_item_id=p_auction_item_id for update;
 select * into lot from public.auction_items where id=p_auction_item_id for update;
 if lot.winner_bidder_id is distinct from caller then raise exception 'Winner order unavailable' using errcode='42501'; end if;
 if existing.id is not null then
  if existing.buyer_id<>caller or lot.winner_order_id is distinct from existing.id then
   raise exception 'Winner order inconsistency' using errcode='23514'; end if;
  return existing.id; -- Includes paid/expired history; never reserve a second time.
 end if;
 if lot.winner_order_id is not null or lot.lot_status<>'WINNER_PENDING' or lot.quantity<>1
  or lot.payment_window_expires_at is null or lot.payment_window_expires_at<=clock_timestamp()
  or lot.winning_bid_minor is null or lot.winning_bid_minor not between 100 and 9007199254740991
  or not exists(select 1 from public.auctions where id=lot.auction_id and status in ('LIVE','ENDED')
   and ends_at<=clock_timestamp() and currency='INR') then
  raise exception 'Winner payment window is unavailable' using errcode='22023'; end if;
 select * into shipping from public.addresses where id=p_shipping_address_id and user_id=caller for share;
 if not found then raise exception 'Select a saved address belonging to this buyer' using errcode='42501'; end if;
 if length(trim(shipping.full_name)) not between 2 and 80 or length(trim(shipping.address_line1)) not between 3 and 120
  or length(trim(shipping.city)) not between 2 and 60 or length(trim(shipping.state)) not between 2 and 60
  or length(trim(shipping.country)) not between 2 and 60 or trim(shipping.postal_code) !~ '^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$'
  or length(coalesce(shipping.phone,''))>20 then raise exception 'Saved shipping address is incomplete' using errcode='22023'; end if;
 select * into art from public.artworks where id=lot.artwork_id for share;
 if not found or art.status<>'PUBLISHED' or art.seller_id<>lot.seller_id or art.currency<>'INR'
  or not exists(select 1 from public.seller_profiles where id=art.seller_id and status='APPROVED') then
  raise exception 'Artwork is unavailable' using errcode='22023'; end if;
 select * into stock from public.inventory where artwork_id=art.id for update;
 if not found or stock.available_quantity<lot.quantity then raise exception 'Insufficient inventory' using errcode='22023'; end if;
 if lot.payment_window_expires_at<=clock_timestamp() then raise exception 'Winner payment window expired' using errcode='22023'; end if;
 insert into public.orders(buyer_id,status,payment_state,currency,subtotal_minor,total_minor,pricing_state,payment_mode,auction_item_id)
 values(caller,'PAYMENT_PENDING','PENDING','INR',lot.winning_bid_minor,lot.winning_bid_minor,'ITEMS_ONLY','TEST',lot.id)
 returning id into new_order;
 insert into public.order_addresses(order_id,full_name,address_line1,address_line2,city,state,postal_code,country,phone)
 values(new_order,shipping.full_name,shipping.address_line1,shipping.address_line2,shipping.city,shipping.state,shipping.postal_code,shipping.country,shipping.phone);
 insert into public.order_items(order_id,artwork_id,seller_id,title,seller_display_name,image_path,unit_price_minor,quantity)
 values(new_order,art.id,art.seller_id,art.title,(select display_name from public.artist_profiles where id=art.seller_id),
  (select object_path from public.artwork_images where artwork_id=art.id order by position,id limit 1),lot.winning_bid_minor,1)
 returning id into new_item;
 update public.inventory set reserved_quantity=reserved_quantity+1 where artwork_id=art.id;
 insert into public.inventory_reservations(order_item_id,artwork_id,quantity,expires_at)
 values(new_item,art.id,1,lot.payment_window_expires_at);
 update public.auction_items set winner_order_id=new_order where id=lot.id;
 insert into public.order_events(order_id,sequence,event_type,actor_id)
 values(new_order,1,'CREATED',caller),(new_order,2,'PAYMENT_PENDING',caller);
 return new_order;
end $$;

-- Synchronize lot settlement inside the same transaction as trusted payment/
-- expiry. This does not grant any new browser order/payment/inventory writes.
create function private.sync_auction_order_state() returns trigger
language plpgsql security definer set search_path='' as $$
declare lot public.auction_items%rowtype;
begin
 if new.auction_item_id is null then return new; end if;
 select * into lot from public.auction_items where id=new.auction_item_id for update;
 if lot.winner_order_id is distinct from new.id or lot.winner_bidder_id is distinct from new.buyer_id
  or lot.winning_bid_minor is distinct from new.total_minor then
  raise exception 'Auction order linkage is inconsistent' using errcode='23514'; end if;
 if new.status='PAID' and new.payment_state='PAID' then
  if not exists(select 1 from public.payments where order_id=new.id and provider='RAZORPAY_TEST'
   and mode='TEST' and status='SUCCEEDED' and gateway_phase='SETTLED' and amount_minor=new.total_minor and currency=new.currency)
   or not exists(select 1 from public.order_items where order_id=new.id)
   or exists(select 1 from public.order_items i left join public.inventory_reservations r on r.order_item_id=i.id
    where i.order_id=new.id and (r.id is null or r.status<>'CONSUMED')) then
   raise exception 'Verified auction payment settlement required' using errcode='23514'; end if;
  update public.auction_items set lot_status='SETTLED' where id=lot.id;
 elsif new.status='CANCELLED' and old.payment_state='PENDING' then
  if exists(select 1 from public.payments where order_id=new.id and gateway_phase in ('CAPTURING','REVIEW'))
   or exists(select 1 from public.order_items i join public.inventory_reservations r on r.order_item_id=i.id
    where i.order_id=new.id and r.status<>'RELEASED') then
   raise exception 'Auction reservation must be safely released before cancellation' using errcode='23514'; end if;
  update public.auction_items set lot_status='PAYMENT_EXPIRED' where id=lot.id;
 end if;
 return new;
end $$;
revoke all on function private.sync_auction_order_state() from public,anon,authenticated,service_role;
create trigger auction_order_state_changed after update of status,payment_state on public.orders
for each row when (new.auction_item_id is not null) execute function private.sync_auction_order_state();

create or replace function private.close_auction_lots(batch_size integer default 50)
returns integer language plpgsql security definer set search_path='' as $$
declare a record; lot record; winner record; closed integer:=0;
begin
 if batch_size is null or batch_size not between 1 and 200 then raise exception 'Invalid batch size' using errcode='22023'; end if;
 -- Reuse the existing ORDER-first expiry worker, including CAPTURING/REVIEW
 -- protection. Its order update fires the lot synchronization trigger above.
 perform private.expire_checkout_reservations(batch_size);
 for a in select * from public.auctions where status in ('LIVE','SCHEDULED') and ends_at<=clock_timestamp()
  order by ends_at,id limit batch_size for update skip locked loop
  for lot in select * from public.auction_items where auction_id=a.id and lot_status='OPEN'
   order by id limit greatest(batch_size-closed,0) for update skip locked loop
   select bidder_id,amount_minor into winner from public.bids where auction_item_id=lot.id
    and bidder_id<>lot.seller_id and placed_at>=a.starts_at and placed_at<a.ends_at
    order by amount_minor desc,placed_at,id limit 1;
   if found then
    update public.auction_items set lot_status='WINNER_PENDING',winner_bidder_id=winner.bidder_id,winning_bid_minor=winner.amount_minor,
     payment_window_expires_at=clock_timestamp()+make_interval(hours=>payment_window_hours) where id=lot.id;
   else update public.auction_items set lot_status='NO_BIDS' where id=lot.id; end if;
   closed:=closed+1;
  end loop;
  if not exists(select 1 from public.auction_items where auction_id=a.id and lot_status='OPEN') then
   update public.auctions set status='ENDED' where id=a.id; end if;
 end loop;
 -- No order means no inventory reservation to release. Never lock a lot and
 -- then its order: payment/expiry always acquire those locks in reverse order.
 for lot in select id from public.auction_items where lot_status='WINNER_PENDING' and winner_order_id is null
  and payment_window_expires_at<=clock_timestamp() order by id limit batch_size for update skip locked loop
  update public.auction_items set lot_status='PAYMENT_EXPIRED' where id=lot.id and winner_order_id is null;
  closed:=closed+1;
 end loop;
 return closed;
end $$;

create function private.run_auction_lifecycle(batch_size integer default 50)
returns integer language plpgsql security definer set search_path='' as $$
begin
 perform private.activate_due_auctions(batch_size);
 return private.close_auction_lots(batch_size);
end $$;
revoke all on function private.run_auction_lifecycle(integer),private.close_auction_lots(integer) from public,anon,authenticated,service_role;
revoke all on function public.activate_auction(uuid),public.place_bid(uuid,bigint,text),public.create_auction_winner_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.activate_auction(uuid),public.place_bid(uuid,bigint,text),public.create_auction_winner_order(uuid,uuid) to authenticated;
-- Keep the existing named job; update its command rather than add a competing job.
select cron.schedule('artvault-close-auction-lots','* * * * *','select private.run_auction_lifecycle(50);');
do $$ declare tab text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  -- Existing deployments may already publish bids/events. Auction clients now
  -- subscribe ONLY to the sanitized signal table; order Realtime is unchanged.
  foreach tab in array array['auction_items','bids','auctions'] loop
   if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=tab) then
    execute format('alter publication supabase_realtime drop table public.%I',tab);
   end if;
  end loop;
  alter publication supabase_realtime add table public.auction_realtime_signals;
 end if;
end $$;
commit;
