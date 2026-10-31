-- Test gateway only. No live keys, client settlement or production pricing policy.
begin;
alter table public.orders add column payment_mode text check (payment_mode = 'TEST');
alter table public.payments
 add column mode text check (mode = 'TEST'),
 add column provider_order_id text,
 add column gateway_phase text check (gateway_phase in ('CREATING','READY','CAPTURING','SETTLED','REVIEW'));
create unique index payments_razorpay_order on public.payments(order_id) where provider = 'RAZORPAY_TEST';
create unique index payments_provider_order on public.payments(provider,provider_order_id) where provider_order_id is not null;
alter table public.payment_events add column provider_payment_id text;
create index payment_events_provider_payment on public.payment_events(provider,provider_payment_id) where provider_payment_id is not null;
alter table public.payments add constraint razorpay_test_shape check (
 provider <> 'RAZORPAY_TEST' or (mode is not null and mode = 'TEST' and gateway_phase is not null));

-- Called only by the Edge Function after Auth verifies the bearer token. The
-- buyer parameter is never accepted from the HTTP body. Role/ownership are
-- rechecked here. The order lock serializes initiation, capture and expiry.
create function public.begin_razorpay_test_payment(p_order uuid, p_buyer uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; p public.payments%rowtype; fresh boolean:=false;
begin
 select * into o from public.orders where id=p_order for update;
 if not found or o.buyer_id is distinct from p_buyer or not exists(
  select 1 from private.user_roles where id=p_buyer and role in ('CUSTOMER','SELLER')) then
  raise exception 'Order unavailable' using errcode='42501';
 end if;
 select * into p from public.payments where order_id=o.id and provider='RAZORPAY_TEST' for update;
 if o.status<>'PAYMENT_PENDING' or o.payment_state<>'PENDING' then
  raise exception 'Order is not awaiting payment' using errcode='22023';
 end if;
 if p.gateway_phase='CAPTURING' then return to_jsonb(p)||jsonb_build_object('created',false); end if;
 if o.currency<>'INR' or o.total_minor<100 or o.total_minor>9007199254740991
  or not exists(select 1 from public.order_items where order_id=o.id)
  or exists(select 1 from public.order_items i join public.artworks a on a.id=i.artwork_id
   join public.seller_profiles s on s.id=i.seller_id where i.order_id=o.id and (a.status<>'PUBLISHED' or s.status<>'APPROVED'))
  or exists(select 1 from public.order_items i left join public.inventory_reservations r on r.order_item_id=i.id
   where i.order_id=o.id and (r.id is null or r.status<>'ACTIVE' or r.quantity<>i.quantity or r.expires_at<=now())) then
  raise exception 'Order reservation is unavailable' using errcode='22023';
 end if;
 -- ITEMS_ONLY is deliberately supported for sandbox payments only. Shipping
 -- and tax are NOT declared zero or finalized. Live checkout needs that policy.
 if p.id is null then
  insert into public.payments(order_id,provider,idempotency_key,amount_minor,currency,mode,gateway_phase)
  values(o.id,'RAZORPAY_TEST','razorpay-test:'||o.id,o.total_minor,o.currency,'TEST','CREATING') returning * into p;
  update public.orders set payment_mode='TEST' where id=o.id;
  fresh:=true;
 end if;
 return to_jsonb(p)||jsonb_build_object('created',fresh);
end $$;

create function public.attach_razorpay_test_order(p_payment uuid,p_provider_order text)
returns void language plpgsql security definer set search_path='' as $$
declare p public.payments%rowtype;
begin
 perform 1 from public.orders where id=(select order_id from public.payments where id=p_payment) for update;
 select * into p from public.payments where id=p_payment and provider='RAZORPAY_TEST' for update;
 if not found or p_provider_order is null or p_provider_order !~ '^order_[A-Za-z0-9]+$' then
  raise exception 'Invalid provider order' using errcode='22023'; end if;
 if p.provider_order_id=p_provider_order then return; end if;
 if p.gateway_phase<>'CREATING' or p.provider_order_id is not null then
  raise exception 'Provider order already assigned' using errcode='22023'; end if;
 update public.payments set provider_order_id=p_provider_order,gateway_phase='READY' where id=p.id;
end $$;

-- Claim BEFORE the capture HTTP request. Only the winner may send capture;
-- retries fetch provider state, never blindly repeat a charge. Expiry skips
-- CAPTURING even after the clock deadline until trusted reconciliation.
create function public.claim_razorpay_test_capture(p_payment uuid,p_provider_payment text,p_amount bigint,p_currency text)
returns boolean language plpgsql security definer set search_path='' as $$
declare p public.payments%rowtype; o public.orders%rowtype;
begin
 select * into o from public.orders where id=(select order_id from public.payments where id=p_payment) for update;
 select * into p from public.payments where id=p_payment and provider='RAZORPAY_TEST' for update;
 if not found or p_provider_payment is null or p_provider_payment !~ '^pay_[A-Za-z0-9]+$'
  or p.amount_minor is distinct from p_amount or p.currency is distinct from p_currency then
  raise exception 'Payment mismatch' using errcode='22023'; end if;
 if p.gateway_phase in ('CAPTURING','SETTLED') then
  if p.provider_payment_id is distinct from p_provider_payment then raise exception 'Another payment is processing' using errcode='22023'; end if;
  return false;
 end if;
 -- Serialize this decision with moderation/approval changes, in stable ID order.
 perform a.id from public.artworks a join public.order_items i on i.artwork_id=a.id
  where i.order_id=o.id order by a.id for share of a;
 perform s.id from public.seller_profiles s where s.id in (select seller_id from public.order_items where order_id=o.id)
  order by s.id for share;
 if p.gateway_phase<>'READY' or o.status<>'PAYMENT_PENDING' or o.payment_state<>'PENDING'
  or not exists(select 1 from public.order_items where order_id=o.id)
  or exists(select 1 from public.order_items i join public.artworks a on a.id=i.artwork_id
   join public.seller_profiles s on s.id=i.seller_id where i.order_id=o.id and (a.status<>'PUBLISHED' or s.status<>'APPROVED'))
  or exists(select 1 from public.order_items i left join public.inventory_reservations r on r.order_item_id=i.id
   where i.order_id=o.id and (r.id is null or r.status<>'ACTIVE' or r.quantity<>i.quantity or r.expires_at<=now())) then
  raise exception 'Reservation cannot be captured' using errcode='22023'; end if;
 update public.payments set gateway_phase='CAPTURING',provider_payment_id=p_provider_payment,status='PENDING' where id=p.id;
 return true;
end $$;

-- Only verified provider facts enter here (Edge signature + authenticated API
-- fetch). This function is not executable by anon/authenticated/app admins.
create function public.record_razorpay_test_result(p_payment uuid,p_provider_payment text,p_amount bigint,p_currency text,
 p_state text,p_event text,p_hash text)
returns text language plpgsql security definer set search_path='' as $$
declare p public.payments%rowtype; o public.orders%rowtype; r record; e public.payment_events%rowtype;
begin
 select * into o from public.orders where id=(select order_id from public.payments where id=p_payment) for update;
 select * into p from public.payments where id=p_payment and provider='RAZORPAY_TEST' for update;
 if not found or p.amount_minor is distinct from p_amount or p.currency is distinct from p_currency
  or p_provider_payment is null or p_provider_payment !~ '^pay_[A-Za-z0-9]+$'
  or p_event is null or length(p_event) not between 1 and 200 or p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
  or p_state is null or p_state not in ('captured','failed','refunded','review') then
  raise exception 'Invalid verified payment' using errcode='22023'; end if;
 select * into e from public.payment_events where provider='RAZORPAY_TEST' and provider_event_id=p_event;
 if found then
  if e.payment_id is distinct from p.id or e.payload_sha256<>p_hash then raise exception 'Event collision' using errcode='22023'; end if;
  return case when p.gateway_phase='REVIEW' then 'REVIEW' else p.status end;
 end if;
 insert into public.payment_events(payment_id,provider,provider_payment_id,provider_event_id,event_type,payload_sha256,verified_at,processed_at)
 values(p.id,'RAZORPAY_TEST',p_provider_payment,p_event,p_state,p_hash,now(),now());
 if p_state='captured' then
  if p.status='SUCCEEDED' and p.provider_payment_id=p_provider_payment then return p.status; end if;
  if p.gateway_phase<>'CAPTURING' or p.provider_payment_id is distinct from p_provider_payment
   or o.status<>'PAYMENT_PENDING' or o.payment_state<>'PENDING' then
   -- Late/unsolicited capture must never resurrect expired stock or grant fulfillment.
   if p.gateway_phase<>'SETTLED' then update public.payments set gateway_phase='REVIEW' where id=p.id; end if;
   return 'REVIEW';
  end if;
  if exists(select 1 from public.order_items i left join public.inventory_reservations res on res.order_item_id=i.id
   where i.order_id=o.id and (res.id is null or res.status<>'ACTIVE' or res.quantity<>i.quantity)) then
   raise exception 'Reservation inconsistency' using errcode='23514'; end if;
  for r in select res.* from public.inventory_reservations res join public.order_items i on i.id=res.order_item_id
   where i.order_id=o.id order by res.artwork_id for update of res loop
   update public.inventory set physical_quantity=physical_quantity-r.quantity,reserved_quantity=reserved_quantity-r.quantity
    where artwork_id=r.artwork_id and physical_quantity>=r.quantity and reserved_quantity>=r.quantity;
   if not found then raise exception 'Inventory inconsistency' using errcode='23514'; end if;
   update public.inventory_reservations set status='CONSUMED',consumed_at=now() where id=r.id;
  end loop;
  update public.payments set status='SUCCEEDED',gateway_phase='SETTLED' where id=p.id;
  update public.orders set status='PAID',payment_state='PAID',payment_mode='TEST' where id=o.id;
  insert into public.order_events(order_id,sequence,event_type)
   select o.id,coalesce(max(sequence),0)+1,'PAID' from public.order_events where order_id=o.id;
  return 'SUCCEEDED';
 elsif p_state='failed' then
  -- A stale failed attempt cannot undo a captured payment or an in-flight capture.
  if p.gateway_phase='READY' or (p.gateway_phase='CAPTURING' and p.provider_payment_id=p_provider_payment) then
   update public.payments set status='FAILED',gateway_phase='READY',provider_payment_id=null where id=p.id;
   return 'FAILED';
  end if;
 elsif p_state in ('review','refunded') then
  -- Refund processing/restocking is a separate trusted lifecycle, never inferred.
  update public.payments set gateway_phase='REVIEW' where id=p.id;
  return 'REVIEW';
 end if;
 return p.status;
end $$;

create or replace function public.expire_checkout_reservations(batch_size integer default 100)
returns integer language plpgsql security definer set search_path='' as $$
declare o record; r record; released integer:=0;
begin
 if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then
  raise exception 'Administrator access required' using errcode='42501'; end if;
 if batch_size is null or batch_size not between 1 and 500 then raise exception 'Invalid batch size' using errcode='22023'; end if;
 for o in select ord.id from public.orders ord where ord.status='PAYMENT_PENDING' and ord.payment_state='PENDING'
  and exists(select 1 from public.order_items i join public.inventory_reservations exp_res on exp_res.order_item_id=i.id
   where i.order_id=ord.id and exp_res.status='ACTIVE' and exp_res.expires_at<=now()) order by ord.id limit batch_size for update skip locked loop
  -- Recheck AFTER acquiring the order lock: a capture may have started while waiting.
  if exists(select 1 from public.payments p where p.order_id=o.id and p.gateway_phase in ('CAPTURING','REVIEW')) then continue; end if;
  for r in select res.* from public.inventory_reservations res join public.order_items i on i.id=res.order_item_id
   where i.order_id=o.id and res.status='ACTIVE' order by res.artwork_id for update of res loop
   update public.inventory set reserved_quantity=reserved_quantity-r.quantity where artwork_id=r.artwork_id;
   update public.inventory_reservations set status='RELEASED',released_at=now() where id=r.id;
  end loop;
  update public.orders set status='CANCELLED',cancellation_reason='RESERVATION_EXPIRED' where id=o.id;
  update public.payments set status='CANCELLED' where order_id=o.id and provider='RAZORPAY_TEST' and gateway_phase in ('CREATING','READY');
  insert into public.order_events(order_id,sequence,event_type,actor_id)
   select o.id,coalesce(max(sequence),0)+1,'CANCELLED',auth.uid() from public.order_events where order_id=o.id;
  released:=released+1;
 end loop;
 return released;
end $$;
revoke all on function public.begin_razorpay_test_payment(uuid,uuid),public.attach_razorpay_test_order(uuid,text),
 public.claim_razorpay_test_capture(uuid,text,bigint,text),public.record_razorpay_test_result(uuid,text,bigint,text,text,text,text)
 from public,anon,authenticated;
grant execute on function public.begin_razorpay_test_payment(uuid,uuid),public.attach_razorpay_test_order(uuid,text),
 public.claim_razorpay_test_capture(uuid,text,bigint,text),public.record_razorpay_test_result(uuid,text,bigint,text,text,text,text)
 to service_role;
commit;
