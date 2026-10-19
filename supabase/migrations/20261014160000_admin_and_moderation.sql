-- Module 4: Admin & Moderation foundation, RBAC enforcement, and secure audit logging.
begin;

-- Ensure auth.users has email in test harnesses if missing
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='auth' and table_name='users' and column_name='email') then
    alter table auth.users add column email text;
  end if;
end $$;

-- 1. Extend public.admin_logs with previous_state and new_state
alter table public.admin_logs
  add column if not exists previous_state text,
  add column if not exists new_state text;

-- 2. Extend public.profiles with account moderation status
alter table public.profiles
  add column if not exists status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED')),
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text;

create policy profiles_admin_read on public.profiles for select to authenticated
  using (private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]));

-- 3. Update seller_profiles check constraints to support 'SUSPENDED'
alter table public.seller_profiles drop constraint if exists seller_profiles_status_check;
alter table public.seller_profiles add constraint seller_profiles_status_check check (status in ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'));

alter table public.seller_profiles drop constraint if exists seller_profiles_check;
alter table public.seller_profiles drop constraint if exists seller_profiles_review_check;
alter table public.seller_profiles add constraint seller_profiles_review_check check (
  (status='PENDING' and reviewed_at is null and reviewed_by is null and rejection_reason is null and legacy_review_source_sha256 is null)
  or (status='APPROVED' and reviewed_at is not null and (reviewed_by is not null or legacy_review_source_sha256 is not null) and rejection_reason is null)
  or (status='REJECTED' and reviewed_at is not null and reviewed_by is not null and rejection_reason is not null and length(trim(rejection_reason))>0 and legacy_review_source_sha256 is null)
  or (status='SUSPENDED' and reviewed_at is not null and (reviewed_by is not null or legacy_review_source_sha256 is not null) and rejection_reason is not null and length(trim(rejection_reason))>0)
);

-- 4. Update seller_profiles select RLS policy so ADMIN and SUPER_ADMIN can inspect all sellers
drop policy if exists sellers_read on public.seller_profiles;
create policy sellers_read on public.seller_profiles for select to authenticated
  using (id = (select auth.uid()) or private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]));

-- 5. Updated public.review_seller supporting APPROVED, REJECTED, and SUSPENDED with audit states
create or replace function public.review_seller(target uuid, decision text, reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.seller_profiles%rowtype;
  old_status text;
begin
  if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;

  if decision not in ('APPROVED','REJECTED','SUSPENDED') or decision is null then
    raise exception 'Invalid decision' using errcode='22023';
  end if;

  if decision in ('REJECTED','SUSPENDED') and (reason is null or length(trim(reason)) not between 1 and 500) then
    raise exception 'A moderation reason is required' using errcode='22023';
  end if;

  select * into s from public.seller_profiles where id=target for update;
  if not found then
    raise exception 'Seller profile not found' using errcode='22023';
  end if;

  old_status := s.status;

  if decision = 'APPROVED' then
    if s.status not in ('PENDING', 'SUSPENDED') then
      raise exception 'Application is not eligible for approval' using errcode='22023';
    end if;
    -- Do not turn an administrator into a seller through an old application
    perform 1 from private.user_roles where id=target and role in ('CUSTOMER', 'SELLER') for update;
    if not found then raise exception 'Applicant role is not eligible' using errcode='22023'; end if;

    update public.seller_profiles
      set status='APPROVED', reviewed_by=auth.uid(), reviewed_at=now(), rejection_reason=null
      where id=target;

    update private.user_roles set role='SELLER' where id=target and role='CUSTOMER';

    insert into public.artist_profiles(id, display_name, bio)
      values (target, s.business_name, s.description)
      on conflict (id) do nothing;

  elsif decision = 'REJECTED' then
    if s.status <> 'PENDING' then
      raise exception 'Application is no longer pending' using errcode='22023';
    end if;

    update public.seller_profiles
      set status='REJECTED', reviewed_by=auth.uid(), reviewed_at=now(), rejection_reason=trim(reason)
      where id=target;

  elsif decision = 'SUSPENDED' then
    if s.status <> 'APPROVED' then
      raise exception 'Only approved sellers can be suspended' using errcode='22023';
    end if;

    update public.seller_profiles
      set status='SUSPENDED', reviewed_by=auth.uid(), reviewed_at=now(), rejection_reason=trim(reason)
      where id=target;
  end if;

  insert into public.admin_logs(actor_id, action, target_type, target_id, reason, previous_state, new_state)
    values (
      auth.uid(),
      'SELLER_' || decision,
      'seller',
      target,
      case when decision in ('REJECTED', 'SUSPENDED') then trim(reason) end,
      old_status,
      decision
    );
end $$;

-- 6. Updated public.moderate_artwork supporting PUBLISHED, REJECTED, SUSPENDED, and RESTORE
create or replace function public.moderate_artwork(target uuid, decision text, reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.artworks%rowtype;
  old_status text;
  final_status text;
begin
  if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;

  if decision is null or decision not in ('PUBLISHED','REJECTED','SUSPENDED','RESTORE') then
    raise exception 'Invalid decision' using errcode='22023';
  end if;

  if decision in ('REJECTED','SUSPENDED') and (reason is null or length(trim(reason)) not between 1 and 500) then
    raise exception 'A moderation reason is required' using errcode='22023';
  end if;

  select * into a from public.artworks where id=target for update;
  if not found then raise exception 'Artwork not found' using errcode='22023'; end if;

  old_status := a.status;

  if decision = 'PUBLISHED' then
    if a.status <> 'SUBMITTED' then
      raise exception 'Artwork is no longer eligible for this decision' using errcode='22023';
    end if;
    if (not exists(select 1 from public.artwork_images i
        join storage.objects o on o.bucket_id=i.bucket_id and o.name=i.object_path where i.artwork_id=target)
        or not exists(select 1 from public.seller_profiles where id=a.seller_id and status='APPROVED')) then
      raise exception 'Approved seller and uploaded image required' using errcode='22023';
    end if;
    final_status := 'PUBLISHED';

  elsif decision = 'RESTORE' then
    if a.status <> 'SUSPENDED' then
      raise exception 'Artwork is not suspended' using errcode='22023';
    end if;
    if (not exists(select 1 from public.artwork_images i
        join storage.objects o on o.bucket_id=i.bucket_id and o.name=i.object_path where i.artwork_id=target)
        or not exists(select 1 from public.seller_profiles where id=a.seller_id and status='APPROVED')) then
      raise exception 'Approved seller and uploaded image required' using errcode='22023';
    end if;
    final_status := 'PUBLISHED';

  elsif decision = 'SUSPENDED' then
    if a.status <> 'PUBLISHED' then
      raise exception 'Artwork is no longer eligible for this decision' using errcode='22023';
    end if;
    final_status := 'SUSPENDED';

  elsif decision = 'REJECTED' then
    if a.status <> 'SUBMITTED' then
      raise exception 'Artwork is no longer eligible for this decision' using errcode='22023';
    end if;
    final_status := 'REJECTED';
  end if;

  update public.artworks
    set status=final_status, reviewed_by=auth.uid(), reviewed_at=now(),
        rejection_reason=case when decision in ('REJECTED','SUSPENDED') then trim(reason) else null end
    where id=target;

  insert into public.admin_logs(actor_id, action, target_type, target_id, reason, previous_state, new_state)
    values (
      auth.uid(),
      'ARTWORK_' || decision,
      'artwork',
      target,
      case when decision in ('REJECTED','SUSPENDED') then trim(reason) else null end,
      old_status,
      final_status
    );
end $$;

-- 7. User moderation RPC
create or replace function public.moderate_user(target uuid, decision text, reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles%rowtype;
  target_role public.app_role;
  caller_role public.app_role;
  old_status text;
begin
  if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;

  if target = auth.uid() then
    raise exception 'Cannot moderate your own account' using errcode='42501';
  end if;

  if decision is null or decision not in ('ACTIVE', 'SUSPENDED') then
    raise exception 'Invalid decision' using errcode='22023';
  end if;

  if decision = 'SUSPENDED' and (reason is null or length(trim(reason)) not between 1 and 500) then
    raise exception 'A suspension reason is required' using errcode='22023';
  end if;

  select * into p from public.profiles where id=target for update;
  if not found then raise exception 'User not found' using errcode='22023'; end if;

  select role into target_role from private.user_roles where id=target;
  select role into caller_role from private.user_roles where id=auth.uid();

  -- An ADMIN cannot suspend a SUPER_ADMIN
  if target_role = 'SUPER_ADMIN' and caller_role <> 'SUPER_ADMIN' then
    raise exception 'Cannot moderate super administrator' using errcode='42501';
  end if;

  old_status := p.status;

  update public.profiles
    set status = decision,
        suspended_at = case when decision = 'SUSPENDED' then now() else null end,
        suspension_reason = case when decision = 'SUSPENDED' then trim(reason) else null end
    where id = target;

  insert into public.admin_logs(actor_id, action, target_type, target_id, reason, previous_state, new_state)
    values (
      auth.uid(),
      'USER_' || decision,
      'profile',
      target,
      case when decision = 'SUSPENDED' then trim(reason) else null end,
      old_status,
      decision
    );
end $$;

-- 8. Secure role assignment RPC (SUPER_ADMIN only)
create or replace function public.set_user_role(target uuid, new_role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
declare
  old_role public.app_role;
  caller_role public.app_role;
begin
  select role into caller_role from private.user_roles where id=auth.uid();
  if caller_role is distinct from 'SUPER_ADMIN' then
    raise exception 'Super administrator access required' using errcode='42501';
  end if;

  if target = auth.uid() and new_role <> 'SUPER_ADMIN' then
    raise exception 'Cannot demote yourself from super administrator' using errcode='42501';
  end if;

  select role into old_role from private.user_roles where id=target for update;
  if not found then raise exception 'User not found' using errcode='22023'; end if;

  if old_role = new_role then return; end if;

  update private.user_roles
    set role = new_role, assigned_by = auth.uid(), updated_at = now()
    where id = target;

  insert into public.admin_logs(actor_id, action, target_type, target_id, reason, previous_state, new_state)
    values (
      auth.uid(),
      'ROLE_CHANGE',
      'user_role',
      target,
      'Role changed to ' || new_role::text,
      old_role::text,
      new_role::text
    );
end $$;

-- 9. Dashboard metrics RPC
create or replace function public.get_admin_dashboard_metrics()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  metrics jsonb;
begin
  if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;

  select jsonb_build_object(
    'totalUsers', (select count(*) from public.profiles),
    'totalSellers', (select count(*) from public.seller_profiles),
    'pendingSellers', (select count(*) from public.seller_profiles where status = 'PENDING'),
    'approvedSellers', (select count(*) from public.seller_profiles where status = 'APPROVED'),
    'suspendedSellers', (select count(*) from public.seller_profiles where status = 'SUSPENDED'),
    'totalArtworks', (select count(*) from public.artworks),
    'publishedArtworks', (select count(*) from public.artworks where status = 'PUBLISHED'),
    'submittedArtworks', (select count(*) from public.artworks where status = 'SUBMITTED'),
    'suspendedArtworks', (select count(*) from public.artworks where status = 'SUSPENDED'),
    'rejectedArtworks', (select count(*) from public.artworks where status = 'REJECTED'),
    'totalOrders', (select count(*) from public.orders),
    'paidOrders', (select count(*) from public.orders where status = 'PAID' or payment_state = 'PAID'),
    'pendingOrders', (select count(*) from public.orders where status in ('CREATED','PAYMENT_PENDING') and payment_state = 'PENDING'),
    'cancelledOrders', (select count(*) from public.orders where status = 'CANCELLED'),
    'totalRevenueMinor', coalesce((select sum(total_minor) from public.orders where payment_state = 'PAID'), 0)
  ) into metrics;

  return metrics;
end $$;

-- 10. Admin users oversight query RPC
create or replace function public.get_admin_users()
returns table(
  id uuid,
  display_name text,
  email text,
  role public.app_role,
  account_status text,
  seller_status text,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;

  return query
  select
    p.id,
    p.display_name,
    u.email,
    coalesce(r.role, 'CUSTOMER'::public.app_role) as role,
    coalesce(p.status, 'ACTIVE') as account_status,
    s.status as seller_status,
    p.created_at
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join private.user_roles r on r.id = p.id
  left join public.seller_profiles s on s.id = p.id
  order by p.created_at desc
  limit 200;
end $$;

-- 11. Admin orders oversight query RPC
create or replace function public.get_admin_orders()
returns table(
  id uuid,
  buyer_id uuid,
  buyer_name text,
  buyer_email text,
  status text,
  payment_state text,
  currency text,
  total_minor bigint,
  item_count bigint,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;

  return query
  select
    o.id,
    o.buyer_id,
    p.display_name as buyer_name,
    u.email as buyer_email,
    o.status,
    o.payment_state,
    o.currency,
    o.total_minor,
    coalesce((select count(*) from public.order_items i where i.order_id = o.id), 0) as item_count,
    o.created_at
  from public.orders o
  left join public.profiles p on p.id = o.buyer_id
  left join auth.users u on u.id = o.buyer_id
  order by o.created_at desc
  limit 200;
end $$;

-- 12. Admin payments oversight query RPC
create or replace function public.get_admin_payments()
returns table(
  id uuid,
  order_id uuid,
  provider text,
  mode text,
  status text,
  gateway_phase text,
  amount_minor bigint,
  currency text,
  provider_order_id text,
  provider_payment_id text,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;

  return query
  select
    p.id,
    p.order_id,
    p.provider,
    p.mode,
    p.status,
    p.gateway_phase,
    p.amount_minor,
    p.currency,
    p.provider_order_id,
    p.provider_payment_id,
    p.created_at
  from public.payments p
  order by p.created_at desc
  limit 200;
end $$;

-- 13. Admin audit logs query RPC
create or replace function public.get_admin_logs()
returns table(
  id uuid,
  actor_id uuid,
  actor_name text,
  action text,
  target_type text,
  target_id uuid,
  reason text,
  previous_state text,
  new_state text,
  occurred_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;

  return query
  select
    l.id,
    l.actor_id,
    p.display_name as actor_name,
    l.action,
    l.target_type,
    l.target_id,
    l.reason,
    l.previous_state,
    l.new_state,
    l.occurred_at
  from public.admin_logs l
  left join public.profiles p on p.id = l.actor_id
  order by l.occurred_at desc
  limit 200;
end $$;

-- 14. Revoke public/anon and grant authenticated execute permissions
revoke all on function public.review_seller(uuid, text, text) from public, anon, authenticated;
revoke all on function public.moderate_artwork(uuid, text, text) from public, anon, authenticated;
revoke all on function public.moderate_user(uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_user_role(uuid, public.app_role) from public, anon, authenticated;
revoke all on function public.get_admin_dashboard_metrics() from public, anon, authenticated;
revoke all on function public.get_admin_users() from public, anon, authenticated;
revoke all on function public.get_admin_orders() from public, anon, authenticated;
revoke all on function public.get_admin_payments() from public, anon, authenticated;
revoke all on function public.get_admin_logs() from public, anon, authenticated;

grant execute on function public.review_seller(uuid, text, text) to authenticated;
grant execute on function public.moderate_artwork(uuid, text, text) to authenticated;
grant execute on function public.moderate_user(uuid, text, text) to authenticated;
grant execute on function public.set_user_role(uuid, public.app_role) to authenticated;
grant execute on function public.get_admin_dashboard_metrics() to authenticated;
grant execute on function public.get_admin_users() to authenticated;
grant execute on function public.get_admin_orders() to authenticated;
grant execute on function public.get_admin_payments() to authenticated;
grant execute on function public.get_admin_logs() to authenticated;

commit;

