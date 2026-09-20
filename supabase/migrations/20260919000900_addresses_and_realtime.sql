begin;

-- Address writes are serialized by profile row so exactly one default can
-- exist under concurrent requests. The caller identity always comes from
-- auth.uid(), never a user_id supplied by the browser.
create or replace function public.save_address(target uuid, payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  result_id uuid := coalesce(target, gen_random_uuid());
  wants_default boolean := false;
begin
  if owner_id is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object'
    or coalesce(payload->>'isDefault','false') not in ('true','false')
    or length(trim(coalesce(payload->>'fullName',''))) not between 2 and 80
    or length(trim(coalesce(payload->>'addressLine1',''))) not between 3 and 120
    or length(trim(coalesce(payload->>'city',''))) not between 2 and 60
    or length(trim(coalesce(payload->>'state',''))) not between 2 and 60
    or length(trim(coalesce(payload->>'country',''))) not between 2 and 60
    or trim(coalesce(payload->>'postalCode','')) !~ '^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$'
    or length(coalesce(payload->>'addressLine2','')) > 120
    or length(coalesce(payload->>'phone','')) > 20 then
    raise exception 'Invalid address' using errcode = '22023';
  end if;
  wants_default := coalesce((payload->>'isDefault')::boolean, false);
  perform 1 from public.profiles where id = owner_id for update;
  if target is not null and not exists(select 1 from public.addresses where id = target and user_id = owner_id) then
    raise exception 'Address not owned' using errcode = '42501';
  end if;
  if wants_default then
    update public.addresses set is_default = false where user_id = owner_id and is_default;
  end if;
  insert into public.addresses(id,user_id,full_name,address_line1,address_line2,city,state,postal_code,country,phone,is_default)
  values(result_id,owner_id,trim(payload->>'fullName'),trim(payload->>'addressLine1'),nullif(trim(payload->>'addressLine2'),''),
    trim(payload->>'city'),trim(payload->>'state'),trim(payload->>'postalCode'),trim(payload->>'country'),nullif(trim(payload->>'phone'),''),wants_default)
  on conflict(id) do update set full_name=excluded.full_name,address_line1=excluded.address_line1,address_line2=excluded.address_line2,
    city=excluded.city,state=excluded.state,postal_code=excluded.postal_code,country=excluded.country,phone=excluded.phone,is_default=excluded.is_default;
  return result_id;
end $$;

create or replace function public.set_default_address(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Sign in required' using errcode='42501'; end if;
  perform 1 from public.profiles where id=owner_id for update;
  if not exists(select 1 from public.addresses where id=target and user_id=owner_id) then
    raise exception 'Address not owned' using errcode='42501';
  end if;
  update public.addresses set is_default=false where user_id=owner_id and is_default;
  update public.addresses set is_default=true where id=target;
end $$;

create or replace function public.delete_address(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  delete from public.addresses where id=target and user_id=auth.uid();
  if not found then raise exception 'Address not owned' using errcode='42501'; end if;
end $$;

revoke all on function public.save_address(uuid,jsonb),public.set_default_address(uuid),public.delete_address(uuid) from public,anon,authenticated;
grant execute on function public.save_address(uuid,jsonb),public.set_default_address(uuid),public.delete_address(uuid) to authenticated;

-- Supabase's hosted Realtime publication exists there. This conditional keeps
-- the version-controlled migration testable in isolated PostgreSQL harnesses.
do $$
declare table_name text;
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['profiles','seller_profiles','artist_profiles','artworks','inventory','cart_items','wishlist_items','addresses','orders','order_items','notifications','auctions','bids'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;
commit;
