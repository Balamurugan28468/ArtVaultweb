-- Storage API policies, not public buckets. No existing objects are modified.
begin;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('artwork-images','artwork-images',false,10485760,array['image/jpeg','image/png','image/webp']),
       ('ar-assets','ar-assets',false,20971520,array['model/gltf-binary','model/vnd.usdz+zip'])
on conflict (id) do nothing;
do $$ begin
 if exists(select 1 from storage.buckets where id in ('artwork-images','ar-assets') and public) then
  raise exception 'ArtVault requires private buckets; inspect existing bucket configuration before applying';
 end if;
end $$;
-- The trusted attachment workflow must allocate metadata before an upload.
-- No direct client image-metadata writes are granted in this foundation.
create function private.can_upload_artwork_image(path text) returns boolean
language sql stable security definer set search_path = '' as $$
 select private.has_role(array['SELLER']::public.app_role[]) and exists(
  select 1 from public.artwork_images i join public.artworks a on a.id = i.artwork_id
  join public.inventory inv on inv.artwork_id = a.id
  where i.object_path = path and a.seller_id = auth.uid() and a.status = 'DRAFT'
   and inv.reserved_quantity = 0
   and path = a.seller_id::text || '/' || a.id::text || '/' || i.id::text
 );
$$;
revoke all on function private.can_upload_artwork_image(text) from public, anon, authenticated;
grant execute on function private.can_upload_artwork_image(text) to authenticated;

create policy artvault_image_read on storage.objects for select to anon, authenticated
using (bucket_id = 'artwork-images' and exists(
 select 1 from public.artwork_images i join public.artworks a on a.id = i.artwork_id
 where i.object_path = name and (a.status = 'PUBLISHED' or a.seller_id = (select auth.uid()))
));
create policy artvault_image_upload on storage.objects for insert to authenticated
with check (bucket_id = 'artwork-images' and private.can_upload_artwork_image(name));
-- No UPDATE or DELETE policy: immutable paths, cleanup via a future trusted operation.
create policy artvault_ar_read on storage.objects for select to anon, authenticated
using (bucket_id = 'ar-assets' and exists(
 select 1 from public.artwork_ar_assets ar where ar.object_path = name and ar.status = 'READY'
));
-- Generated AR objects may only be written by trusted backend/operator code.
commit;

