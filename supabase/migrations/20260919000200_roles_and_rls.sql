-- RLS and role foundation. No checkout, payment, bidding or moderation RPC implementation.
begin;
create function private.has_role(allowed public.app_role[]) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from private.user_roles r where r.id = auth.uid() and r.role = any(allowed)); $$;
create function private.is_order_buyer(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.orders o where o.id = target and o.buyer_id = auth.uid()); $$;
create function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = ''
as $$ select role from private.user_roles where id = auth.uid(); $$;
revoke all on function private.has_role(public.app_role[]), private.is_order_buyer(uuid), public.current_app_role() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.has_role(public.app_role[]), private.is_order_buyer(uuid), public.current_app_role() to authenticated;

create function private.provision_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id) values (new.id);
 -- No role is read from raw_user_meta_data or any browser-supplied claim.
 insert into private.user_roles(id, role) values (new.id, 'CUSTOMER');
 return new;
end $$;
revoke all on function private.provision_profile() from public, anon, authenticated;
create trigger artvault_profile_created after insert on auth.users
for each row execute function private.provision_profile();

grant select on public.profiles to authenticated;
grant update(display_name, phone, bio, profile_completed) on public.profiles to authenticated;
create policy profiles_read_own on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_edit_own on public.profiles for update to authenticated
 using (id = (select auth.uid())) with check (id = (select auth.uid()));

grant select on public.seller_profiles to authenticated;
grant insert(id, business_name, description, contact_email) on public.seller_profiles to authenticated;
create policy sellers_read on public.seller_profiles for select to authenticated
 using (id = (select auth.uid()) or (status = 'PENDING' and private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[])));
create policy sellers_apply on public.seller_profiles for insert to authenticated
 with check (id = (select auth.uid()) and status = 'PENDING'
 and private.has_role(array['CUSTOMER']::public.app_role[]));

grant select on public.artist_profiles, public.categories to anon, authenticated;
create policy artists_public on public.artist_profiles for select to anon, authenticated using (true);
create policy categories_public on public.categories for select to anon, authenticated using (true);
grant update(display_name, bio) on public.artist_profiles to authenticated;
create policy artists_edit_own on public.artist_profiles for update to authenticated
 using (id = (select auth.uid()) and private.has_role(array['SELLER']::public.app_role[]))
 with check (id = (select auth.uid()) and private.has_role(array['SELLER']::public.app_role[]));

grant select on public.artworks to anon, authenticated;
create policy artworks_published on public.artworks for select to anon, authenticated using (status = 'PUBLISHED');
create policy artworks_owner_admin on public.artworks for select to authenticated
 using (seller_id = (select auth.uid()) or private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]));
grant insert(id, seller_id, category_id, title, description, price_minor, currency) on public.artworks to authenticated;
grant update(title, description, category_id, price_minor, currency) on public.artworks to authenticated;
create policy artworks_create_draft on public.artworks for insert to authenticated
 with check (seller_id = (select auth.uid()) and status = 'DRAFT'
 and private.has_role(array['SELLER']::public.app_role[])
 and exists(select 1 from public.seller_profiles s where s.id = seller_id and s.status = 'APPROVED'));
create policy artworks_edit_draft on public.artworks for update to authenticated
 using (seller_id = (select auth.uid()) and status = 'DRAFT' and private.has_role(array['SELLER']::public.app_role[]))
 with check (seller_id = (select auth.uid()) and status = 'DRAFT' and private.has_role(array['SELLER']::public.app_role[]));

grant select on public.artwork_images, public.artwork_tags to anon, authenticated;
create policy images_visible_artwork on public.artwork_images for select to anon, authenticated
 using (exists(select 1 from public.artworks a where a.id = artwork_id));
create policy tags_visible_artwork on public.artwork_tags for select to anon, authenticated
 using (exists(select 1 from public.artworks a where a.id = artwork_id));
grant select on public.inventory to authenticated;
create policy inventory_seller_read on public.inventory for select to authenticated
 using (exists(select 1 from public.artworks a where a.id = artwork_id and a.seller_id = (select auth.uid()))
 and private.has_role(array['SELLER']::public.app_role[]));
-- No direct inventory/reservation/order/payment writes, even for app admins.

grant select, delete on public.carts to authenticated;
grant insert(user_id) on public.carts to authenticated;
create policy carts_own on public.carts for all to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, delete on public.cart_items to authenticated;
grant insert(cart_id, artwork_id, quantity), update(quantity) on public.cart_items to authenticated;
create policy cart_items_own on public.cart_items for all to authenticated
 using (exists(select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())))
 with check (exists(select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid()))
 and exists(select 1 from public.artworks a where a.id = artwork_id and a.status = 'PUBLISHED'));

grant select, delete on public.wishlist_items, public.likes, public.follows to authenticated;
grant insert(user_id, artwork_id) on public.wishlist_items, public.likes to authenticated;
grant insert(user_id, artist_id) on public.follows to authenticated;
create policy wishlist_own_read on public.wishlist_items for select to authenticated using (user_id = (select auth.uid()));
create policy wishlist_own_delete on public.wishlist_items for delete to authenticated using (user_id = (select auth.uid()));
create policy wishlist_own_insert on public.wishlist_items for insert to authenticated with check
 (user_id = (select auth.uid()) and exists(select 1 from public.artworks a where a.id = artwork_id and a.status = 'PUBLISHED'));
create policy likes_own_read on public.likes for select to authenticated using (user_id = (select auth.uid()));
create policy likes_own_delete on public.likes for delete to authenticated using (user_id = (select auth.uid()));
create policy likes_own_insert on public.likes for insert to authenticated with check
 (user_id = (select auth.uid()) and exists(select 1 from public.artworks a where a.id = artwork_id and a.status = 'PUBLISHED'));
create policy follows_own on public.follows for all to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, delete on public.addresses to authenticated;
grant insert(user_id, full_name, address_line1, address_line2, city, state, postal_code, country, phone, is_default),
 update(full_name, address_line1, address_line2, city, state, postal_code, country, phone, is_default)
 on public.addresses to authenticated;
create policy addresses_own on public.addresses for all to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select on public.orders, public.order_addresses, public.order_items, public.order_events to authenticated;
create policy orders_buyer on public.orders for select to authenticated using (buyer_id = (select auth.uid()));
create policy order_addresses_buyer on public.order_addresses for select to authenticated using (private.is_order_buyer(order_id));
create policy order_events_buyer on public.order_events for select to authenticated using (private.is_order_buyer(order_id));
create policy order_items_buyer_seller on public.order_items for select to authenticated using
 (private.is_order_buyer(order_id) or (seller_id = (select auth.uid()) and private.has_role(array['SELLER']::public.app_role[])));
-- Deliberately exclude buyer identity/address, total and other sellers' items.
create function public.get_seller_orders()
returns table(order_id uuid, item_id uuid, title text, quantity integer, subtotal_minor bigint, status text, payment_state text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
 select o.id, i.id, i.title, i.quantity, i.subtotal_minor, o.status, o.payment_state, o.created_at
 from public.order_items i join public.orders o on o.id = i.order_id
 where i.seller_id = auth.uid() and private.has_role(array['SELLER']::public.app_role[])
 order by o.created_at desc, i.id limit 100;
$$;
revoke all on function public.get_seller_orders() from public, anon, authenticated;
grant execute on function public.get_seller_orders() to authenticated;

grant select on public.payments, public.refunds, public.shipments, public.shipment_items to authenticated;
create policy payments_buyer on public.payments for select to authenticated using (private.is_order_buyer(order_id));
create policy refunds_buyer on public.refunds for select to authenticated using
 (exists(select 1 from public.payments p where p.id = payment_id and private.is_order_buyer(p.order_id)));
create policy shipments_scoped on public.shipments for select to authenticated using
 (private.is_order_buyer(order_id) or (seller_id = (select auth.uid()) and private.has_role(array['SELLER']::public.app_role[])));
create policy shipment_items_scoped on public.shipment_items for select to authenticated using
 (private.is_order_buyer(order_id) or (seller_id = (select auth.uid()) and private.has_role(array['SELLER']::public.app_role[])));

grant select on public.auctions, public.auction_items to anon, authenticated;
create policy auctions_public on public.auctions for select to anon, authenticated using (status in ('SCHEDULED','LIVE','ENDED','FINALIZED'));
create policy auction_items_public on public.auction_items for select to anon, authenticated using
 (exists(select 1 from public.auctions a where a.id = auction_id)
 and exists(select 1 from public.artworks w where w.id = artwork_id and w.status = 'PUBLISHED'));
grant select on public.bids to authenticated;
create policy bids_own on public.bids for select to authenticated using (bidder_id = (select auth.uid()));

grant select on public.notifications, public.admin_logs to authenticated;
grant update(read_at) on public.notifications to authenticated;
create policy notifications_own_read on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy admin_logs_admin on public.admin_logs for select to authenticated
 using (private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]));

grant select on public.artwork_ar_assets, public.artwork_analyses to anon, authenticated;
create policy ar_ready_published on public.artwork_ar_assets for select to anon, authenticated using
 (status = 'READY' and exists(select 1 from public.artworks a where a.id = artwork_id and a.status = 'PUBLISHED')
 and exists(select 1 from public.artwork_images i where i.id = image_id and i.source_sha256 = artwork_ar_assets.source_sha256));
create policy analyses_published on public.artwork_analyses for select to anon, authenticated using
 (exists(select 1 from public.artworks a where a.id = artwork_id and a.status = 'PUBLISHED'));

grant select, delete on public.ai_conversations to authenticated;
grant insert(user_id, title), update(title) on public.ai_conversations to authenticated;
create policy conversations_own on public.ai_conversations for all to authenticated
 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select on public.ai_messages to authenticated;
create policy messages_own_read on public.ai_messages for select to authenticated using
 (exists(select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));
-- No AI message writer, payment-event reader/writer, reservation writer or admin
-- mutation is exposed until that trusted backend operation is implemented.
commit;

