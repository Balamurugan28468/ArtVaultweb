-- Module 4 corrective migration: Resolve return query datatype mismatch for auth.users email column
-- Project: fqxhjijxgdjfthmfokqk
-- Cast u.email to text explicitly to match the PL/pgSQL function return type contract.

begin;

-- 1. Admin users oversight query RPC
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
    u.email::text as email,
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

-- 2. Admin orders oversight query RPC
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
    u.email::text as buyer_email,
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

-- 3. Preserve function execution grants
revoke all on function public.get_admin_users() from public, anon, authenticated;
revoke all on function public.get_admin_orders() from public, anon, authenticated;
grant execute on function public.get_admin_users() to authenticated;
grant execute on function public.get_admin_orders() to authenticated;

commit;

