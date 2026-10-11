begin;
-- Buyer history needs reservation display facts, not mutation authority or
-- unrelated reservation metadata. Keep all writes service-owned.
grant select (order_item_id, status, expires_at) on public.inventory_reservations to authenticated;
create policy reservations_order_buyer_read on public.inventory_reservations
for select to authenticated using (
  exists (select 1 from public.order_items i
    where i.id = inventory_reservations.order_item_id
      and private.is_order_buyer(i.order_id))
);
commit;
