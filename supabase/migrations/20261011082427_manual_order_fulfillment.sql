-- Manual, one shipment per seller/order. No historical order or inventory updates.
begin;
create unique index shipments_one_seller_order on public.shipments(order_id,seller_id);

create function private.order_can_fulfill(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.orders o where o.id=target and o.payment_mode is null
  and o.payment_state='PAID' and o.status in ('PAID','PROCESSING','SHIPPED','DELIVERED')
  and exists(select 1 from public.payments p where p.order_id=o.id and p.status='SUCCEEDED'
   and p.mode is null and p.provider<>'RAZORPAY_TEST' and p.amount_minor=o.total_minor and p.currency=o.currency)
  and not exists(select 1 from public.payments p where p.order_id=o.id and (p.mode='TEST' or p.gateway_phase='REVIEW'
   or p.status in ('REFUNDED','PARTIALLY_REFUNDED'))));
$$;
revoke all on function private.order_can_fulfill(uuid) from public,anon,authenticated,service_role;

-- New fulfillment projection complements the existing minimal seller summary.
-- Only this seller's line items; no buyer UID, other sellers' totals or provider IDs.
create function public.get_seller_fulfillment_orders() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(entry order by created_at desc),'[]'::jsonb) from (
 select o.created_at,jsonb_build_object('orderId',o.id,'createdAt',o.created_at,'orderStatus',o.status,
  'test',o.payment_mode='TEST','canFulfill',private.order_can_fulfill(o.id),
  'shipment', (select jsonb_build_object('status',s.status,'carrier',s.carrier,'trackingNumber',s.tracking_number,
    'shippedAt',s.shipped_at,'deliveredAt',s.delivered_at) from public.shipments s where s.order_id=o.id and s.seller_id=auth.uid()),
  'address',case when private.order_can_fulfill(o.id) then (select jsonb_build_object('fullName',a.full_name,
    'line1',a.address_line1,'line2',a.address_line2,'city',a.city,'state',a.state,'postalCode',a.postal_code,
    'country',a.country,'phone',a.phone) from public.order_addresses a where a.order_id=o.id) else null end,
  'items',(select jsonb_agg(jsonb_build_object('id',i.id,'title',i.title,'quantity',i.quantity,
    'subtotal',i.subtotal_minor,'imagePath',i.image_path)) from public.order_items i where i.order_id=o.id and i.seller_id=auth.uid())) entry
 from public.orders o where o.payment_state='PAID' and private.has_role(array['SELLER']::public.app_role[])
 and exists(select 1 from public.order_items i where i.order_id=o.id and i.seller_id=auth.uid())
 order by o.created_at desc limit 100) scoped;
$$;
revoke all on function public.get_seller_fulfillment_orders() from public,anon;
grant execute on function public.get_seller_fulfillment_orders() to authenticated;

create function public.advance_seller_fulfillment(target uuid, action text, carrier_name text default null, tracking_code text default null)
returns text language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; s public.shipments%rowtype; next_order text; seller uuid:=auth.uid();
begin
 if seller is null or not private.has_role(array['SELLER']::public.app_role[])
  or not exists(select 1 from public.seller_profiles where id=seller and status='APPROVED') then
  raise exception 'Approved seller access required' using errcode='42501'; end if;
 -- Same order-first locking discipline as payment/expiry; serializes multiple sellers.
 select * into o from public.orders where id=target for update;
 if not found or not exists(select 1 from public.order_items where order_id=target and seller_id=seller) then
  raise exception 'Order unavailable' using errcode='42501'; end if;
 if not private.order_can_fulfill(target) then
  raise exception 'Verified live payment required; TEST orders cannot be fulfilled' using errcode='22023'; end if;
 if action is null or action not in ('PROCESS','SHIP','DELIVER') then
  raise exception 'Invalid fulfillment action' using errcode='22023'; end if;
 select * into s from public.shipments where order_id=target and seller_id=seller for update;
 if action='PROCESS' then
  if s.id is null then
   insert into public.shipments(order_id,seller_id) values(target,seller) returning * into s;
   insert into public.shipment_items(shipment_id,order_item_id,order_id,seller_id,quantity)
    select s.id,id,order_id,seller_id,quantity from public.order_items where order_id=target and seller_id=seller;
  elsif s.status<>'PENDING' then raise exception 'Processing cannot reverse shipment' using errcode='22023'; end if;
 elsif action='SHIP' then
  carrier_name:=btrim(carrier_name); tracking_code:=btrim(tracking_code);
  if carrier_name is null or length(carrier_name) not between 2 and 100 or carrier_name ~ '[[:cntrl:]]'
   or tracking_code is null or length(tracking_code) not between 2 and 100 or tracking_code !~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]*$' then
   raise exception 'Enter a valid carrier and tracking number (2-100 characters)' using errcode='22023'; end if;
  if s.id is null or s.status not in ('PENDING','SHIPPED') then raise exception 'Process this shipment before shipping' using errcode='22023'; end if;
  if s.status='SHIPPED' then
   if s.carrier is distinct from carrier_name or s.tracking_number is distinct from tracking_code then
    raise exception 'Shipped tracking cannot be overwritten' using errcode='22023'; end if;
  else
   update public.shipments set status='SHIPPED',carrier=carrier_name,tracking_number=tracking_code,shipped_at=now() where id=s.id;
  end if;
 else
  if s.id is null or s.status not in ('SHIPPED','DELIVERED') then raise exception 'Only shipped items can be marked delivered' using errcode='22023'; end if;
  if s.status='SHIPPED' then update public.shipments set status='DELIVERED',delivered_at=now() where id=s.id; end if;
 end if;
 -- Aggregate conservatively across every seller/item; one seller cannot complete another's items.
 if not exists(select 1 from public.order_items i where i.order_id=target and not exists(
  select 1 from public.shipment_items si join public.shipments sh on sh.id=si.shipment_id
  where si.order_item_id=i.id and si.quantity=i.quantity and sh.status='DELIVERED')) then next_order:='DELIVERED';
 elsif not exists(select 1 from public.order_items i where i.order_id=target and not exists(
  select 1 from public.shipment_items si join public.shipments sh on sh.id=si.shipment_id
  where si.order_item_id=i.id and si.quantity=i.quantity and sh.status in ('SHIPPED','DELIVERED'))) then next_order:='SHIPPED';
 else next_order:='PROCESSING'; end if;
 if o.status<>next_order then
  update public.orders set status=next_order where id=target;
  insert into public.order_events(order_id,sequence,event_type,actor_id)
   select target,coalesce(max(sequence),0)+1,next_order,seller from public.order_events where order_id=target;
 end if;
 return next_order;
end $$;
revoke all on function public.advance_seller_fulfillment(uuid,text,text,text) from public,anon;
grant execute on function public.advance_seller_fulfillment(uuid,text,text,text) to authenticated;
commit;
