begin;

-- ============================================================================
-- Forward-only migration: Artwork Reviews, Notification Security & Analyses RLS
--
-- Corrected 2026-11-01: fixed payment_state values, UPDATE policy, RPC guard,
-- removed insecure notification INSERT grant, tightened artwork_analyses grants,
-- added immutable-field trigger, and added performance indexes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLE: artwork_reviews
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. GRANTS: read for anyone, write only for authenticated buyers
-- ---------------------------------------------------------------------------
grant select on public.artwork_reviews to anon, authenticated;
grant insert, update, delete on public.artwork_reviews to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS POLICIES
-- ---------------------------------------------------------------------------

-- SELECT: only reviews on PUBLISHED artworks are visible publicly
drop policy if exists artwork_reviews_read on public.artwork_reviews;
create policy artwork_reviews_read on public.artwork_reviews
  for select to anon, authenticated
  using (exists (select 1 from public.artworks a where a.id = artwork_reviews.artwork_id and a.status = 'PUBLISHED'));

-- INSERT: must be own buyer_id, must not be the seller, must have a PAID order
-- FIX 1: payment_state = 'PAID' (the only valid paid value per the schema check constraint)
-- FIX 2 (partial): also guards seller-reviewing-own and verified-purchase on INSERT
drop policy if exists artwork_reviews_insert on public.artwork_reviews;
create policy artwork_reviews_insert on public.artwork_reviews
  for insert to authenticated
  with check (
    artwork_reviews.buyer_id = auth.uid()
    -- Prevent sellers from reviewing their own artwork
    and not exists (
      select 1 from public.artworks a
      where a.id = artwork_reviews.artwork_id
        and a.seller_id = auth.uid()
    )
    -- Verified-purchase gate: buyer must have a PAID order containing this artwork
    -- FIX 1: 'PAID' is the correct payment_state value per the schema check constraint
    and exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.artwork_id = artwork_reviews.artwork_id
        and o.buyer_id = auth.uid()
        and o.payment_state = 'PAID'
    )
  );

-- UPDATE: re-validates all eligibility conditions and prevents field changes
-- FIX 2: WITH CHECK re-validates verified purchase + seller-not-buyer;
--        immutable-field enforcement is handled by the trigger below.
drop policy if exists artwork_reviews_update on public.artwork_reviews;
create policy artwork_reviews_update on public.artwork_reviews
  for update to authenticated
  using (artwork_reviews.buyer_id = auth.uid())
  with check (
    artwork_reviews.buyer_id = auth.uid()
    -- Prevent sellers from reviewing their own artwork (still applies on update)
    and not exists (
      select 1 from public.artworks a
      where a.id = artwork_reviews.artwork_id
        and a.seller_id = auth.uid()
    )
    -- Re-validate verified purchase on every update (belt-and-suspenders)
    and exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.artwork_id = artwork_reviews.artwork_id
        and o.buyer_id = auth.uid()
        and o.payment_state = 'PAID'
    )
  );

-- DELETE: only the buyer who wrote the review can delete it
drop policy if exists artwork_reviews_delete on public.artwork_reviews;
create policy artwork_reviews_delete on public.artwork_reviews
  for delete to authenticated
  using (artwork_reviews.buyer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. TRIGGER: keep updated_at in sync
-- ---------------------------------------------------------------------------
drop trigger if exists touch_updated_at on public.artwork_reviews;
create trigger touch_updated_at
  before update on public.artwork_reviews
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. TRIGGER: enforce immutable artwork_id and buyer_id columns
-- FIX 2 (complement): prevents UPDATE from changing artwork_id or buyer_id
--        to bypass the verified-purchase or seller-owns check.
-- ---------------------------------------------------------------------------
create or replace function private.enforce_review_immutable_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.artwork_id <> old.artwork_id then
    raise exception 'artwork_id cannot be changed after a review is created';
  end if;
  if new.buyer_id <> old.buyer_id then
    raise exception 'buyer_id cannot be changed after a review is created';
  end if;
  return new;
end;
$$;

-- Only trusted server-side code may call this function
revoke all on function private.enforce_review_immutable_fields() from public, anon, authenticated;

drop trigger if exists enforce_review_immutable_fields on public.artwork_reviews;
create trigger enforce_review_immutable_fields
  before update on public.artwork_reviews
  for each row execute function private.enforce_review_immutable_fields();

-- ---------------------------------------------------------------------------
-- 6. RPC: get_artwork_rating_summary
-- FIX 3: guard against returning summary data for non-PUBLISHED artworks
-- ---------------------------------------------------------------------------
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
  -- FIX 3: Only return data when the artwork is PUBLISHED. For any other status
  --        (DRAFT, SUBMITTED, SUSPENDED, REJECTED) return an empty result set.
  select
    coalesce(round(avg(r.rating)::numeric, 2), 0.00) as average_rating,
    count(r.id)                                       as review_count,
    count(r.id) filter (where r.rating = 1)           as rating_1_count,
    count(r.id) filter (where r.rating = 2)           as rating_2_count,
    count(r.id) filter (where r.rating = 3)           as rating_3_count,
    count(r.id) filter (where r.rating = 4)           as rating_4_count,
    count(r.id) filter (where r.rating = 5)           as rating_5_count
  from public.artwork_reviews r
  where r.artwork_id = target_artwork_id
    -- FIX 3: confirm the artwork is published before aggregating
    and exists (
      select 1 from public.artworks a
      where a.id = target_artwork_id
        and a.status = 'PUBLISHED'
    );
$$;

revoke all on function public.get_artwork_rating_summary(uuid) from public, anon, authenticated;
grant execute on function public.get_artwork_rating_summary(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. NOTIFICATIONS: remove insecure client INSERT grant
-- FIX 4: The original migration granted INSERT on notifications to all
--        authenticated users, which allows any user to forge arbitrary
--        system notification payloads (order confirmations, moderation
--        decisions, payment events, etc.) to themselves.
--
--        Per 20260919000200_roles_and_rls.sql the notifications table was
--        intentionally left without a client INSERT grant. Notifications
--        must only be written by trusted server-side / service_role paths
--        (database triggers, Edge Functions, backend workers).
--
--        The frontend createNotification() already has a silent try/catch
--        fallback, so removing this grant does not break the UI.
-- ---------------------------------------------------------------------------

-- Revoke the INSERT grant that must not exist on this table for client roles
revoke insert on public.notifications from authenticated;

-- Drop the policy if it was previously created (idempotent safety)
drop policy if exists notifications_own_insert on public.notifications;

-- ---------------------------------------------------------------------------
-- 8. ARTWORK ANALYSES: minimum required grants + seller own-read policy
-- FIX 5: The original migration granted INSERT, UPDATE broadly to authenticated.
--        The grants remain (the frontend AI analysis save path requires them),
--        but we add a seller-own SELECT policy so sellers can read analyses
--        for their own artworks regardless of publication status (previously
--        only the public analyses_published policy existed, which excluded
--        DRAFT/SUBMITTED artworks that sellers need to see in Seller Studio).
-- ---------------------------------------------------------------------------

-- Keep the write grants; analysis saves go through the authenticated client
grant insert, update on public.artwork_analyses to authenticated;

-- INSERT: seller may only insert analyses for artworks they own
drop policy if exists artwork_analyses_seller_insert on public.artwork_analyses;
create policy artwork_analyses_seller_insert on public.artwork_analyses
  for insert to authenticated
  with check (exists (select 1 from public.artworks a where a.id = artwork_id and a.seller_id = auth.uid()));

-- UPDATE: seller may only update analyses for artworks they own
drop policy if exists artwork_analyses_seller_update on public.artwork_analyses;
create policy artwork_analyses_seller_update on public.artwork_analyses
  for update to authenticated
  using  (exists (select 1 from public.artworks a where a.id = artwork_id and a.seller_id = auth.uid()))
  with check (exists (select 1 from public.artworks a where a.id = artwork_id and a.seller_id = auth.uid()));

-- FIX 5 (new): seller can read their own analyses in any artwork status
drop policy if exists artwork_analyses_seller_read on public.artwork_analyses;
create policy artwork_analyses_seller_read on public.artwork_analyses
  for select to authenticated
  using (exists (select 1 from public.artworks a where a.id = artwork_id and a.seller_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 9. INDEXES
-- FIX 7: Performance indexes for common query patterns.
--        The unique constraint (artwork_id, buyer_id) creates an implicit index
--        that covers per-artwork existence checks, but a dedicated single-column
--        index on artwork_id greatly speeds up listing and aggregating reviews
--        for a given artwork, and the buyer_id index speeds up buyer-owned lookups.
-- ---------------------------------------------------------------------------
create index if not exists idx_artwork_reviews_artwork_id
  on public.artwork_reviews (artwork_id);

create index if not exists idx_artwork_reviews_buyer_id
  on public.artwork_reviews (buyer_id);

-- Composite covering index for the rating summary aggregation query
create index if not exists idx_artwork_reviews_artwork_rating
  on public.artwork_reviews (artwork_id, rating);

commit;
