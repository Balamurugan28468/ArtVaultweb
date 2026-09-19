-- Transactions, protected prices and one reservation per immutable order item.
begin;
create function public.create_checkout_order(artwork_ids uuid[], address_id uuid, idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 buyer uuid:=auth.uid(); ids uuid[]; fingerprint text; previous private.checkout_requests%rowtype;
 shipping public.addresses%rowtype; a public.artworks%rowtype; stock public.inventory%rowtype;
 selected uuid; qty integer; total bigint:=0; result_id uuid:=gen_random_uuid(); item_id uuid;
 expiry timestamptz:=now()+interval '30 minutes'; receipt jsonb; v_cart_id uuid;
begin
 if buyer is null or not private.has_role(array['CUSTOMER','SELLER']::public.app_role[]) then
  raise exception 'Buyer authentication required' using errcode='42501';
 end if;
 if idempotency_key is null or idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$'
  or artwork_ids is null or cardinality(artwork_ids) not between 1 and 50
  or array_position(artwork_ids,null) is not null or address_id is null then
  raise exception 'Invalid checkout request' using errcode='22023';
 end if;
 select array_agg(distinct x order by x) into ids from unnest(artwork_ids) x;
 if cardinality(ids)<>cardinality(artwork_ids) then raise exception 'Duplicate artwork' using errcode='22023'; end if;
 fingerprint:=encode(sha256(convert_to(array_to_string(ids,',')||':'||address_id::text,'UTF8')),'hex');
 -- Serialize requests from this buyer, including competing keys and address/cart edits.
 perform 1 from public.profiles where id=buyer for update;
 select * into previous from private.checkout_requests r where r.buyer_id=buyer and r.idempotency_key=create_checkout_order.idempotency_key;
 if found then
  if previous.request_sha256<>fingerprint then raise exception 'Idempotency key was already used for another request' using errcode='22023'; end if;
  select jsonb_build_object('orderId',o.id,'amount',o.total_minor,'currency',o.currency,'status',o.status,'pricingState',o.pricing_state,
   'reservationExpiresAt',(select (extract(epoch from min(r.expires_at))*1000)::bigint from public.inventory_reservations r join public.order_items i on i.id=r.order_item_id where i.order_id=o.id))
   into receipt from public.orders o where o.id=previous.order_id;
  return receipt;
 end if;
 select * into shipping from public.addresses where id=address_id and user_id=buyer for share;
 if not found then raise exception 'Saved address not found' using errcode='42501'; end if;
 select c.id into v_cart_id from public.carts c where c.user_id=buyer for update;
 if not found then raise exception 'Cart not found' using errcode='22023'; end if;
 -- Stable artwork lock order prevents last-unit races and cross-cart deadlocks.
 foreach selected in array ids loop
  select * into a from public.artworks where id=selected for update;
  if not found or a.status<>'PUBLISHED' or a.seller_id=buyer or a.currency<>'INR' then
   raise exception 'Artwork is unavailable for purchase' using errcode='22023';
  end if;
  if not exists(select 1 from public.seller_profiles where id=a.seller_id and status='APPROVED') then
   raise exception 'Seller is unavailable' using errcode='22023';
  end if;
  select ci.quantity into qty from public.cart_items ci where ci.cart_id=v_cart_id and ci.artwork_id=selected for update;
  if not found then raise exception 'Selected artwork is not in your cart' using errcode='22023'; end if;
  select * into stock from public.inventory where artwork_id=selected for update;
  if not found or stock.available_quantity<qty then raise exception 'Insufficient inventory' using errcode='22023'; end if;
  total:=total+a.price_minor*qty;
  if total>9007199254740991 then raise exception 'Order total exceeds supported amount' using errcode='22023'; end if;
 end loop;
 insert into public.orders(id,buyer_id,subtotal_minor,total_minor) values(result_id,buyer,total,total);
 insert into public.order_addresses(order_id,full_name,address_line1,address_line2,city,state,postal_code,country,phone)
 values(result_id,shipping.full_name,shipping.address_line1,shipping.address_line2,shipping.city,shipping.state,shipping.postal_code,shipping.country,shipping.phone);
 foreach selected in array ids loop
  select * into a from public.artworks where id=selected;
  select ci.quantity into qty from public.cart_items ci where ci.cart_id=v_cart_id and ci.artwork_id=selected;
  insert into public.order_items(order_id,artwork_id,seller_id,title,seller_display_name,image_path,unit_price_minor,quantity)
  values(result_id,a.id,a.seller_id,a.title,(select display_name from public.artist_profiles where id=a.seller_id),
   (select object_path from public.artwork_images where artwork_id=a.id order by position,id limit 1),a.price_minor,qty)
  returning id into item_id;
  update public.inventory set reserved_quantity=reserved_quantity+qty where artwork_id=selected;
  insert into public.inventory_reservations(order_item_id,artwork_id,quantity,expires_at) values(item_id,selected,qty,expiry);
  delete from public.cart_items ci where ci.cart_id=v_cart_id and ci.artwork_id=selected;
 end loop;
 insert into public.order_events(order_id,sequence,event_type,actor_id) values(result_id,1,'CREATED',buyer),(result_id,2,'PAYMENT_PENDING',buyer);
 insert into private.checkout_requests(buyer_id,idempotency_key,request_sha256,order_id) values(buyer,idempotency_key,fingerprint,result_id);
 return jsonb_build_object('orderId',result_id,'amount',total,'currency','INR','status','PAYMENT_PENDING','pricingState','ITEMS_ONLY','reservationExpiresAt',(extract(epoch from expiry)*1000)::bigint);
end $$;

-- Local/operator-triggered until an owner-approved production schedule exists.
create function public.expire_checkout_reservations(batch_size integer default 100)
returns integer language plpgsql security definer set search_path = '' as $$
declare o record; r record; released integer:=0;
begin
 if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 if batch_size is null or batch_size not between 1 and 500 then raise exception 'Invalid batch size' using errcode='22023'; end if;
 for o in select ord.id from public.orders ord where ord.status='PAYMENT_PENDING' and ord.payment_state='PENDING'
  and exists(select 1 from public.order_items i join public.inventory_reservations r on r.order_item_id=i.id
   where i.order_id=ord.id and r.status='ACTIVE' and r.expires_at<=now()) order by ord.id limit batch_size for update skip locked loop
  for r in select res.* from public.inventory_reservations res join public.order_items i on i.id=res.order_item_id
   where i.order_id=o.id and res.status='ACTIVE' order by res.artwork_id for update of res loop
   update public.inventory set reserved_quantity=reserved_quantity-r.quantity where artwork_id=r.artwork_id;
   update public.inventory_reservations set status='RELEASED',released_at=now() where id=r.id;
  end loop;
  update public.orders set status='CANCELLED',cancellation_reason='RESERVATION_EXPIRED' where id=o.id;
  insert into public.order_events(order_id,sequence,event_type,actor_id)
   select o.id,coalesce(max(sequence),0)+1,'CANCELLED',auth.uid() from public.order_events where order_id=o.id;
  released:=released+1;
 end loop;
 return released;
end $$;
revoke all on function public.create_checkout_order(uuid[],uuid,text),public.expire_checkout_reservations(integer) from public,anon,authenticated;
grant execute on function public.create_checkout_order(uuid[],uuid,text),public.expire_checkout_reservations(integer) to authenticated;
commit;
