-- Trusted moderation and seller approval. Identity always comes from auth.uid().
begin;
create function public.review_seller(target uuid, decision text, reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.seller_profiles%rowtype;
begin
 if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 if decision not in ('APPROVED','REJECTED') or decision is null then
  raise exception 'Invalid decision' using errcode='22023';
 end if;
 if decision='REJECTED' and (reason is null or length(trim(reason)) not between 1 and 500) then
  raise exception 'A rejection reason is required' using errcode='22023';
 end if;
 select * into s from public.seller_profiles where id=target for update;
 if not found or s.status<>'PENDING' then
  raise exception 'Application is no longer pending' using errcode='22023';
 end if;
 -- Do not turn an administrator into a seller through an old application.
 perform 1 from private.user_roles where id=target and role='CUSTOMER' for update;
 if not found then raise exception 'Applicant role is not eligible' using errcode='22023'; end if;
 update public.seller_profiles set status=decision,reviewed_by=auth.uid(),reviewed_at=now(),
  rejection_reason=case when decision='REJECTED' then trim(reason) end where id=target;
 if decision='APPROVED' then
  update private.user_roles set role='SELLER' where id=target;
  insert into public.artist_profiles(id,display_name,bio) values(target,s.business_name,s.description);
 end if;
 insert into public.admin_logs(actor_id,action,target_type,target_id,reason)
 values(auth.uid(),'SELLER_'||decision,'seller',target,case when decision='REJECTED' then trim(reason) end);
end $$;

create function public.moderate_artwork(target uuid, decision text, reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.artworks%rowtype;
begin
 if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 if decision is null or decision not in ('PUBLISHED','REJECTED','SUSPENDED') then
  raise exception 'Invalid decision' using errcode='22023';
 end if;
 if decision<>'PUBLISHED' and (reason is null or length(trim(reason)) not between 1 and 500) then
  raise exception 'A moderation reason is required' using errcode='22023';
 end if;
 select * into a from public.artworks where id=target for update;
 if not found then raise exception 'Artwork not found' using errcode='22023'; end if;
 if (decision<>'SUSPENDED' and a.status<>'SUBMITTED') or a.status='SUSPENDED' then
  raise exception 'Artwork is no longer eligible for this decision' using errcode='22023';
 end if;
 if decision='PUBLISHED' and (not exists(select 1 from public.artwork_images i
  join storage.objects o on o.bucket_id=i.bucket_id and o.name=i.object_path where i.artwork_id=target)
  or not exists(select 1 from public.seller_profiles where id=a.seller_id and status='APPROVED')) then
  raise exception 'Approved seller and uploaded image required' using errcode='22023';
 end if;
 update public.artworks set status=decision,reviewed_by=auth.uid(),reviewed_at=now(),
  rejection_reason=case when decision<>'PUBLISHED' then trim(reason) end where id=target;
 insert into public.admin_logs(actor_id,action,target_type,target_id,reason)
 values(auth.uid(),'ARTWORK_'||decision,'artwork',target,case when decision<>'PUBLISHED' then trim(reason) end);
end $$;

create function public.set_artwork_inventory(target uuid, quantity integer)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.artworks%rowtype; reserved integer;
begin
 if not private.has_role(array['SELLER']::public.app_role[]) then
  raise exception 'Seller access required' using errcode='42501';
 end if;
 if quantity is null or quantity not between 0 and 999 then
  raise exception 'Invalid inventory quantity' using errcode='22023';
 end if;
 select * into a from public.artworks where id=target for update;
 if not found or a.seller_id<>auth.uid() then raise exception 'Artwork not owned' using errcode='42501'; end if;
 if a.status not in ('DRAFT','REJECTED','PUBLISHED') then
  raise exception 'Artwork is locked' using errcode='22023';
 end if;
 select reserved_quantity into reserved from public.inventory where artwork_id=target for update;
 if not found then raise exception 'Inventory not found' using errcode='22023'; end if;
 if quantity<reserved then raise exception 'Inventory cannot be below active reservations' using errcode='22023'; end if;
 update public.inventory set physical_quantity=quantity where artwork_id=target;
end $$;
revoke all on function public.review_seller(uuid,text,text),public.moderate_artwork(uuid,text,text),public.set_artwork_inventory(uuid,integer) from public,anon,authenticated;
grant execute on function public.review_seller(uuid,text,text),public.moderate_artwork(uuid,text,text),public.set_artwork_inventory(uuid,integer) to authenticated;
commit;
