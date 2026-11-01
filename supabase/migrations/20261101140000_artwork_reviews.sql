begin;

-- ============================================================================
-- Forward-only migration: Artwork Reviews and User Notification Inserts
-- ============================================================================

create table if not exists public.artwork_reviews (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.artworks(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating >= 1 and rating <= 5),
  title text not null check (length(trim(title)) between 1 and 120),
  content text not null check (length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artwork_reviews_buyer_artwork_unique unique (artwork_id, buyer_id)
);

alter table public.artwork_reviews enable row level security;
revoke all on public.artwork_reviews from public, anon, authenticated;
grant all on public.artwork_reviews to service_role;

-- Public & Authenticated Read: anyone can read reviews for PUBLISHED artworks
grant select on public.artwork_reviews to anon, authenticated;

drop policy if exists artwork_reviews_read on public.artwork_reviews;
create policy artwork_reviews_read on public.artwork_reviews
  for select to anon, authenticated
  using (exists (select 1 from public.artworks a where a.id = artwork_id and a.status = 'PUBLISHED'));

-- Authenticated Actions: buyers who have bought the artwork can insert, update, delete
grant insert, update, delete on public.artwork_reviews to authenticated;

drop policy if exists artwork_reviews_insert on public.artwork_reviews;
create policy artwork_reviews_insert on public.artwork_reviews
  for insert to authenticated
  with check (
    buyer_id = auth.uid()
    and not exists (select 1 from public.artworks a where a.id = artwork_id and a.seller_id = auth.uid())
    and exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.artwork_id = artwork_id
        and o.buyer_id = auth.uid()
        and o.payment_state in ('SUCCEEDED', 'SETTLED', 'CAPTURED')
    )
  );

drop policy if exists artwork_reviews_update on public.artwork_reviews;
create policy artwork_reviews_update on public.artwork_reviews
  for update to authenticated
  using (buyer_id = auth.uid())
  with check (buyer_id = auth.uid());

drop policy if exists artwork_reviews_delete on public.artwork_reviews;
create policy artwork_reviews_delete on public.artwork_reviews
  for delete to authenticated
  using (buyer_id = auth.uid());

-- Trigger: keep updated_at in sync
drop trigger if exists touch_updated_at on public.artwork_reviews;
create trigger touch_updated_at before update on public.artwork_reviews
  for each row execute function private.touch_updated_at();

-- Aggregated review ratings RPC
create or replace function public.get_artwork_rating_summary(target_artwork_id uuid)
returns table (
  average_rating numeric(3, 2),
  review_count bigint,
  rating_1_count bigint,
  rating_2_count bigint,
  rating_3_count bigint,
  rating_4_count bigint,
  rating_5_count bigint
)
language sql stable security definer set search_path = '' as $$
  select
    coalesce(round(avg(rating)::numeric, 2), 0.00) as average_rating,
    count(*) as review_count,
    count(*) filter (where rating = 1) as rating_1_count,
    count(*) filter (where rating = 2) as rating_2_count,
    count(*) filter (where rating = 3) as rating_3_count,
    count(*) filter (where rating = 4) as rating_4_count,
    count(*) filter (where rating = 5) as rating_5_count
  from public.artwork_reviews
  where artwork_id = target_artwork_id;
$$;

revoke all on function public.get_artwork_rating_summary(uuid) from public, anon, authenticated;
grant execute on function public.get_artwork_rating_summary(uuid) to anon, authenticated;

-- Allow authenticated users to insert notifications for themselves (or client events)
grant insert on public.notifications to authenticated;
drop policy if exists notifications_own_insert on public.notifications;
create policy notifications_own_insert on public.notifications
  for insert to authenticated
  with check (user_id = auth.uid());

-- Allow sellers to view, generate and save analyses on their own artworks
grant insert, update on public.artwork_analyses to authenticated;
drop policy if exists artwork_analyses_seller_insert on public.artwork_analyses;
create policy artwork_analyses_seller_insert on public.artwork_analyses
  for insert to authenticated
  with check (exists (select 1 from public.artworks a where a.id = artwork_id and a.seller_id = auth.uid()));

drop policy if exists artwork_analyses_seller_update on public.artwork_analyses;
create policy artwork_analyses_seller_update on public.artwork_analyses
  for update to authenticated
  using (exists (select 1 from public.artworks a where a.id = artwork_id and a.seller_id = auth.uid()))
  with check (exists (select 1 from public.artworks a where a.id = artwork_id and a.seller_id = auth.uid()));

commit;
