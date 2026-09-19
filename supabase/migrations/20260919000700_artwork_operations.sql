begin;
-- All edits share the artwork lock with checkout/moderation. No browser can
-- bypass reservation checks with a direct metadata update.
revoke insert,update on public.artworks from authenticated;
revoke insert(id,seller_id,category_id,title,description,price_minor,currency),
 update(title,description,category_id,price_minor,currency) on public.artworks from authenticated;
create function public.save_artwork(target uuid, operation text, fields jsonb default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.artworks%rowtype; category uuid; reserved integer; new_id uuid:=coalesce(target,gen_random_uuid()); tag text;
begin
 if not private.has_role(array['SELLER']::public.app_role[]) or not exists(select 1 from public.seller_profiles where id=auth.uid() and status='APPROVED') then
  raise exception 'Approved seller required' using errcode='42501';
 end if;
 if operation is null or operation not in ('CREATE','EDIT','SAFE_EDIT','SUBMIT','RESUBMIT','REMOVE','DELETE') then
  raise exception 'Invalid artwork operation' using errcode='22023';
 end if;
 if operation='CREATE' then
  if target is not null then raise exception 'New artwork cannot specify an ID' using errcode='22023'; end if;
 else
  select * into a from public.artworks where id=target for update;
  if not found or a.seller_id<>auth.uid() then raise exception 'Artwork not owned' using errcode='42501'; end if;
  select reserved_quantity into reserved from public.inventory where artwork_id=target for update;
  if reserved is null then raise exception 'Inventory missing' using errcode='22023'; end if;
  if a.status in ('SUBMITTED','SUSPENDED') or
   (operation in ('EDIT','DELETE','SUBMIT') and a.status<>'DRAFT') or
   (operation in ('SAFE_EDIT','REMOVE') and a.status<>'PUBLISHED') or
   (operation='RESUBMIT' and a.status not in ('PUBLISHED','REJECTED')) then
   raise exception 'Artwork is locked for this operation' using errcode='22023';
  end if;
  if reserved>0 and operation<>'SAFE_EDIT' then raise exception 'Active reservations prevent this edit' using errcode='22023'; end if;
 end if;
 if operation in ('CREATE','EDIT','RESUBMIT','SAFE_EDIT') then
  if jsonb_typeof(fields)<>'object' or jsonb_typeof(fields->'tags')<>'array' or jsonb_array_length(fields->'tags')>10
   or (fields->>'inventoryCount') is null or (fields->>'inventoryCount')::integer not between 0 and 999
   or (fields->>'price') is null or (fields->>'price')::bigint not between 100 and 9007199254740991 then
   raise exception 'Invalid artwork fields' using errcode='22023';
  end if;
  if (fields->>'inventoryCount')::integer<coalesce(reserved,0) then raise exception 'Inventory below reservations' using errcode='22023'; end if;
  if operation<>'SAFE_EDIT' then
   select id into category from public.categories where slug=fields->>'category';
   if category is null or length(trim(fields->>'title')) not between 1 and 200 or fields->>'title' is null then
    raise exception 'Title and category required' using errcode='22023';
   end if;
  end if;
  if operation='CREATE' then
   insert into public.artworks(id,seller_id,category_id,title,description,price_minor)
    values(new_id,auth.uid(),category,trim(fields->>'title'),coalesce(trim(fields->>'description'),''),(fields->>'price')::bigint);
   insert into public.inventory(artwork_id,physical_quantity) values(new_id,(fields->>'inventoryCount')::integer);
  else
   update public.artworks set price_minor=(fields->>'price')::bigint,
    title=case when operation='SAFE_EDIT' then title else trim(fields->>'title') end,
    description=case when operation='SAFE_EDIT' then description else coalesce(trim(fields->>'description'),'') end,
    category_id=case when operation='SAFE_EDIT' then category_id else category end where id=target;
   update public.inventory set physical_quantity=(fields->>'inventoryCount')::integer where artwork_id=target;
  end if;
  delete from public.artwork_tags where artwork_id=new_id;
  for tag in select distinct trim(value) from jsonb_array_elements_text(fields->'tags') loop
   insert into public.artwork_tags(artwork_id,tag) values(new_id,tag);
  end loop;
 end if;
 if operation in ('SUBMIT','RESUBMIT') and not exists(select 1 from public.artwork_images i join storage.objects o on o.bucket_id=i.bucket_id and o.name=i.object_path where i.artwork_id=new_id) then
  raise exception 'Upload an artwork image first' using errcode='22023';
 end if;
 if operation in ('SUBMIT','RESUBMIT','REMOVE') then
  update public.artworks set status='SUBMITTED',reviewed_at=null,reviewed_by=null,rejection_reason=null where id=new_id;
 end if;
 if operation='DELETE' then
  -- Images must be removed first through the Storage API, not SQL deletion.
  if exists(select 1 from public.artwork_images where artwork_id=target) then raise exception 'Remove artwork images before deletion' using errcode='22023'; end if;
  delete from public.artwork_tags where artwork_id=target;
  delete from public.inventory where artwork_id=target;
  delete from public.artworks where id=target;
 end if;
 return new_id;
end $$;
revoke all on function public.save_artwork(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_artwork(uuid,text,jsonb) to authenticated;

grant select on public.inventory to anon;
create policy inventory_published_read on public.inventory for select to anon,authenticated using
 (exists(select 1 from public.artworks a where a.id=artwork_id and a.status='PUBLISHED'));
create policy inventory_admin_read on public.inventory for select to authenticated using
 (private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]));
create function public.artwork_like_count(target uuid) returns bigint
language sql stable security definer set search_path='' as $$
 select count(*) from public.likes l where l.artwork_id=target and exists(
  select 1 from public.artworks a where a.id=target and (a.status='PUBLISHED' or a.seller_id=auth.uid()
   or private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[])));
$$;
revoke all on function public.artwork_like_count(uuid) from public,anon,authenticated;
grant execute on function public.artwork_like_count(uuid) to anon,authenticated;
create view public.artwork_catalog with (security_invoker=true) as
 select a.*,c.slug as category,i.physical_quantity,i.reserved_quantity,
 public.artwork_like_count(a.id) as like_count,
 coalesce((select jsonb_agg(t.tag order by t.tag) from public.artwork_tags t where t.artwork_id=a.id),'[]'::jsonb) as tags,
 coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'path',m.object_path,'order',m.position,'contentType',m.content_type,'size',m.byte_size) order by m.position) from public.artwork_images m where m.artwork_id=a.id),'[]'::jsonb) as images
 from public.artworks a join public.categories c on c.id=a.category_id left join public.inventory i on i.artwork_id=a.id;
grant select on public.artwork_catalog to anon,authenticated,service_role;
commit;
