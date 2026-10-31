begin;
-- Uploads use immutable, owner-scoped paths. New staged uploads may coexist
-- with published images; only a trusted resubmission attaches them publicly.
create or replace function private.can_upload_artwork_image(path text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.has_role(array['SELLER']::public.app_role[]) and path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'
 and exists(select 1 from public.artworks a join public.inventory i on i.artwork_id=a.id
  where a.seller_id=auth.uid() and a.status in ('DRAFT','REJECTED','PUBLISHED') and i.reserved_quantity=0
  and split_part(path,'/',1)=a.seller_id::text and split_part(path,'/',2)=a.id::text)
 and not exists(select 1 from public.artwork_images i where i.object_path=path);
$$;
create policy artvault_staged_image_read on storage.objects for select to authenticated using
 (bucket_id='artwork-images' and split_part(name,'/',1)=(select auth.uid())::text);
create policy artvault_unattached_image_delete on storage.objects for delete to authenticated using
 (bucket_id='artwork-images' and private.can_upload_artwork_image(name));
-- Admin reviewers can view the same images as their protected review queue.
create policy artvault_image_admin_read on storage.objects for select to authenticated using
 (bucket_id='artwork-images' and private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[])
 and exists(select 1 from public.artwork_images i where i.object_path=name));
alter table public.artwork_images drop constraint artwork_images_artwork_id_position_key;
alter table public.artwork_images add constraint artwork_images_artwork_id_position_key unique(artwork_id,position) deferrable initially deferred;
create function private.replace_artwork_images(target uuid, images jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare image jsonb; position integer:=0; a public.artworks%rowtype; image_id uuid; path text; object storage.objects%rowtype;
begin
 select * into a from public.artworks where id=target for update;
 if not found or a.seller_id<>auth.uid() or not private.has_role(array['SELLER']::public.app_role[]) then
  raise exception 'Artwork not owned' using errcode='42501';
 end if;
 if jsonb_typeof(images)<>'array' or images is null or jsonb_array_length(images)>6 then
  raise exception 'Invalid image list' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_array_elements(images) e group by e->>'id' having count(*)>1) then
  raise exception 'Duplicate image' using errcode='22023';
 end if;
 delete from public.artwork_images i where i.artwork_id=target and not exists(select 1 from jsonb_array_elements(images) e where e->>'id'=i.id::text);
 for image in select value from jsonb_array_elements(images) loop
  image_id:=(image->>'id')::uuid;
  path:=a.seller_id::text||'/'||target::text||'/'||image_id::text;
  select * into object from storage.objects where bucket_id='artwork-images' and name=path;
  if not found then raise exception 'Uploaded image not found' using errcode='22023'; end if;
  if exists(select 1 from public.artwork_images where id=image_id and artwork_id<>target) then
   raise exception 'Image belongs to another artwork' using errcode='42501';
  end if;
  -- MIME/size are from Storage, not the request; original source hashes survive reordering.
  insert into public.artwork_images(id,artwork_id,object_path,position,content_type,byte_size)
   values(image_id,target,path,position,object.metadata->>'mimetype',(object.metadata->>'size')::bigint)
   on conflict(id) do update set position=excluded.position;
  position:=position+1;
 end loop;
end $$;
revoke all on function private.replace_artwork_images(uuid,jsonb) from public,anon,authenticated;
create function public.update_artwork_images(target uuid, images jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare a public.artworks%rowtype;
begin
 select * into a from public.artworks where id=target for update;
 if not found or a.seller_id<>auth.uid() then raise exception 'Artwork not owned' using errcode='42501'; end if;
 if a.status<>'DRAFT' or exists(select 1 from public.inventory where artwork_id=target and reserved_quantity>0) then
  raise exception 'Artwork images are locked' using errcode='22023';
 end if;
 perform private.replace_artwork_images(target,images);
end $$;
create function public.resubmit_artwork(target uuid, fields jsonb, images jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare a public.artworks%rowtype;
begin
 select * into a from public.artworks where id=target for update;
 if not found or a.seller_id<>auth.uid() then raise exception 'Artwork not owned' using errcode='42501'; end if;
 if a.status not in ('PUBLISHED','REJECTED') or exists(select 1 from public.inventory where artwork_id=target and reserved_quantity>0) then
  raise exception 'Artwork images are locked' using errcode='22023';
 end if;
 perform private.replace_artwork_images(target,images);
 perform public.save_artwork(target,'RESUBMIT',fields);
end $$;
revoke all on function public.update_artwork_images(uuid,jsonb),public.resubmit_artwork(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.update_artwork_images(uuid,jsonb),public.resubmit_artwork(uuid,jsonb,jsonb) to authenticated;
commit;
