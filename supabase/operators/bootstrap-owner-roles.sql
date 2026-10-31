-- Owner-approved one-time identity bootstrap. Run only through trusted SQL access.
-- Create/invite both identities through Supabase Auth first. No password, secret,
-- browser metadata, ownership transfer or historical moderation rewrite occurs.
-- Safe to repeat: unexpected roles fail closed; audit entries are not duplicated.
begin;
select pg_advisory_xact_lock(714229318);
do $$
declare
  seller_uid uuid;
  administrator_uid uuid;
  seller_role public.app_role;
  administrator_role public.app_role;
begin
  select id into strict seller_uid from auth.users
    where lower(email) = 'bm440946@gmail.com';
  select id into strict administrator_uid from auth.users
    where lower(email) = 'bm03102004@gmail.com';
  if seller_uid = administrator_uid then
    raise exception 'Separate seller and administrator identities are required';
  end if;

  select role into strict seller_role from private.user_roles
    where id = seller_uid for update;
  select role into strict administrator_role from private.user_roles
    where id = administrator_uid for update;
  if seller_role not in ('CUSTOMER', 'SELLER') then
    raise exception 'Unexpected seller role; inspect before changing authorization';
  end if;
  if administrator_role not in ('CUSTOMER', 'SUPER_ADMIN') then
    raise exception 'Unexpected administrator role; inspect before changing authorization';
  end if;

  update private.user_roles set role = 'SUPER_ADMIN', assigned_by = administrator_uid
    where id = administrator_uid and role <> 'SUPER_ADMIN';
  update private.user_roles set role = 'SELLER', assigned_by = administrator_uid
    where id = seller_uid and role <> 'SELLER';

  insert into public.admin_logs(actor_id, action, target_type, target_id, reason)
  select administrator_uid, 'MIGRATION_ROLE_BOOTSTRAP', 'profile', target,
    'Explicit owner approval: separate SELLER and SUPER_ADMIN identities; no ownership transfer.'
  from unnest(array[seller_uid, administrator_uid]) target
  where not exists (
    select 1 from public.admin_logs l where l.action = 'MIGRATION_ROLE_BOOTSTRAP'
      and l.target_type = 'profile' and l.target_id = target
  );
end $$;
commit;
