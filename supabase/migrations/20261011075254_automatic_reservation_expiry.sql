-- One shared implementation: database-owner Cron worker and role-checked operator wrapper.
-- No business rows are changed by installation. Existing order/capture locks are preserved.
begin;
create or replace function private.expire_checkout_reservations(batch_size integer default 100)
returns integer language plpgsql security definer set search_path='' as $$
declare o record; r record; released integer:=0;
begin
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
revoke all on function private.expire_checkout_reservations(integer) from public, anon, authenticated, service_role;

create or replace function public.expire_checkout_reservations(batch_size integer default 100)
returns integer language plpgsql security definer set search_path='' as $$
begin
 if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 return private.expire_checkout_reservations(batch_size);
end $$;
revoke all on function public.expire_checkout_reservations(integer) from public, anon;
grant execute on function public.expire_checkout_reservations(integer) to authenticated;

-- Fail installation if native scheduling cannot be installed; no silent fallback.
create extension if not exists pg_cron with schema pg_catalog;
-- Named registration is repeat-safe. Jobs run as the migration owner (postgres), not a browser role.
select cron.schedule('artvault-expire-checkout-reservations', '* * * * *',
 'select private.expire_checkout_reservations(100);');
commit;
