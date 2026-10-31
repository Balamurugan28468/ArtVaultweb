begin;

-- An object can only be deleted by its owner after its metadata reference was
-- removed by a protected artwork operation. This permits cleanup after a
-- resubmission has moved an artwork back to SUBMITTED without allowing a
-- seller to delete an attached, published image directly.
drop policy if exists artvault_unattached_image_delete on storage.objects;
create policy artvault_unattached_image_delete on storage.objects for delete to authenticated using (
  bucket_id = 'artwork-images'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and not exists(select 1 from public.artwork_images i where i.object_path = name)
);
commit;
