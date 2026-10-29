-- Module 06. Additive local migration; requires the pending Module 05 privacy
-- migration. No hosted execution, business-row deletion, or inventory writes.
begin;

alter table public.artwork_analyses
 add column analysis_method text not null default 'LEGACY' check(analysis_method in ('LEGACY','HEURISTIC','VISION')),
 add column analysis_version text not null default 'legacy',
 add column analysis_status text not null default 'SUCCEEDED' check(analysis_status in ('SUCCEEDED','FALLBACK')),
 add column input_fingerprint text check(input_fingerprint ~ '^[a-f0-9]{64}$'),
 add column fallback_reason text check(fallback_reason is null or fallback_reason in ('PROVIDER_NOT_CONFIGURED','PROVIDER_UNAVAILABLE'));

create table private.weekly_selection_config (
 id uuid primary key default gen_random_uuid(), singleton boolean not null default true unique check(singleton),
 enabled boolean not null default false, timezone text not null default 'Asia/Kolkata',
 weekday integer not null default 0 check(weekday between 0 and 6), local_start time not null default '18:00',
 duration_hours integer not null default 24 check(duration_hours between 1 and 72),
 candidate_limit integer not null default 250 check(candidate_limit between 5 and 1000),
 payment_window_hours integer not null default 24 check(payment_window_hours between 1 and 168),
 updated_at timestamptz not null default now()
);
insert into private.weekly_selection_config default values;
create table private.auction_selection_windows (
 id uuid primary key default gen_random_uuid(), starts_at timestamptz not null unique, ends_at timestamptz not null,
 timezone text not null, prepare_at timestamptz not null, active_run_id uuid,
 auction_id uuid unique references public.auctions(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(ends_at>starts_at), check(prepare_at<starts_at)
);
create table private.auction_selection_runs (
 id uuid primary key default gen_random_uuid(), window_id uuid not null references private.auction_selection_windows(id) on delete restrict,
 generation integer not null check(generation>0), unique(window_id,generation),
 status text not null check(status in ('GENERATED','APPROVED','REJECTED','SUPERSEDED','SCHEDULED','FAILED')),
 scoring_version text not null default 'metadata-v1' check(scoring_version='metadata-v1'),
 analysis_method text not null default 'HEURISTIC' check(analysis_method='HEURISTIC'),
 requested_by uuid references public.profiles(id) on delete restrict,
 reviewed_by uuid references public.profiles(id) on delete restrict,
 review_reason text check(char_length(review_reason)<=1000),
 failure_code text check(failure_code in ('CANDIDATE_LIMIT','GENERATION_FAILED')),
 eligible_count integer not null default 0 check(eligible_count>=0),
 selected_count integer not null default 0 check(selected_count between 0 and 5),
 captured_at timestamptz not null default clock_timestamp(), reviewed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table private.auction_selection_windows add constraint selection_active_run_fk
 foreign key(active_run_id) references private.auction_selection_runs(id) on delete restrict;
create table private.auction_selection_candidates (
 id uuid primary key default gen_random_uuid(), run_id uuid not null references private.auction_selection_runs(id) on delete restrict,
 -- Preserve recommendation history without preventing existing draft deletion.
 artwork_id uuid references public.artworks(id) on delete set null,
 source_artwork_id uuid not null,
 seller_id uuid not null references public.seller_profiles(id) on delete restrict,
 unique(run_id,source_artwork_id), check(artwork_id is null or artwork_id=source_artwork_id),
 eligible boolean not null, reasons text[] not null default '{}',
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'), snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 score numeric(7,3) not null check(score between 0 and 100), components jsonb not null check(jsonb_typeof(components)='object'),
 rank integer check(rank>0), selected_position integer check(selected_position between 1 and 5), unique(run_id,selected_position),
 explanation text not null, created_at timestamptz not null default now(),
 check(eligible or (rank is null and selected_position is null))
);
create index selection_runs_history on private.auction_selection_runs(window_id,generation desc);
create index selection_candidates_rank on private.auction_selection_candidates(run_id,rank);
create index selection_windows_due on private.auction_selection_windows(prepare_at,starts_at) where auction_id is null;
do $$ declare tab text; begin
 foreach tab in array array['weekly_selection_config','auction_selection_windows','auction_selection_runs','auction_selection_candidates'] loop
  execute format('alter table private.%I enable row level security',tab);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',tab);
 end loop;
end $$;

-- Curated evidence only. Storage existence is checked, no image bytes are
-- interpreted here. Union distinct prevents like + wishlist double counting;
-- seller/self and inactive-account interactions do not boost a candidate.
create function private.selection_evidence(p_artwork_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a record; image record; reasons text[]:='{}'; engagements integer; exposures integer; payload jsonb;
begin
 select w.*,s.status as seller_status,p.status as account_status,coalesce(i.available_quantity,0) as available,
  coalesce(i.physical_quantity,0) as physical,coalesce(i.reserved_quantity,0) as reserved,c.name as category,
  coalesce(ap.display_name,s.business_name) as artist
 into a from public.artworks w join public.seller_profiles s on s.id=w.seller_id
 join public.profiles p on p.id=s.id join public.categories c on c.id=w.category_id
 left join public.artist_profiles ap on ap.id=s.id left join public.inventory i on i.artwork_id=w.id where w.id=p_artwork_id;
 if not found then return jsonb_build_object('eligible',false,'reasons',jsonb_build_array('ARTWORK_MISSING')); end if;
 select im.object_path,im.source_sha256 into image from public.artwork_images im
 where im.artwork_id=a.id and im.content_type in ('image/jpeg','image/png','image/webp')
 and im.source_sha256 ~ '^[a-f0-9]{64}$'
 and exists(select 1 from storage.objects o where o.bucket_id=im.bucket_id and o.name=im.object_path)
 order by im.position,im.id limit 1;
 if a.status<>'PUBLISHED' then reasons:=array_append(reasons,'NOT_PUBLISHED'); end if;
 if a.seller_status<>'APPROVED' or a.account_status<>'ACTIVE' then reasons:=array_append(reasons,'SELLER_UNAVAILABLE'); end if;
 if a.available<1 then reasons:=array_append(reasons,'INSUFFICIENT_AVAILABLE_STOCK'); end if;
 if a.currency<>'INR' or a.price_minor<100 then reasons:=array_append(reasons,'MARKETPLACE_POLICY'); end if;
 if image.object_path is null then reasons:=array_append(reasons,'VALID_IMAGE_REQUIRED'); end if;
 if exists(select 1 from public.auction_items i join public.auctions ev on ev.id=i.auction_id where i.artwork_id=a.id
  and ((ev.status in ('SCHEDULED','LIVE') and i.lot_status='OPEN') or i.lot_status='WINNER_PENDING')) then
  reasons:=array_append(reasons,'AUCTION_CONFLICT'); end if;
 select count(*) into engagements from (
  select user_id from public.likes where artwork_id=a.id union select user_id from public.wishlist_items where artwork_id=a.id
 ) e join public.profiles p on p.id=e.user_id where p.status='ACTIVE' and e.user_id<>a.seller_id;
 select count(*) into exposures from public.auction_items i join public.auctions ev on ev.id=i.auction_id
 where i.artwork_id=a.id and ev.status<>'CANCELLED';
 payload:=jsonb_build_object('artworkId',a.id,'sellerId',a.seller_id,'title',a.title,'description',left(a.description,200),
  'descriptionLength',char_length(trim(a.description)),'descriptionHash',encode(sha256(convert_to(a.description,'UTF8')),'hex'),
  'category',a.category,'artist',a.artist,'currency',a.currency,'priceMinor',a.price_minor,'createdAt',a.created_at,
  'artworkUpdatedAt',a.updated_at,'sellerStatus',a.seller_status,'accountStatus',a.account_status,
  'available',a.available,'physical',a.physical,'reserved',a.reserved,'imagePath',image.object_path,'imageHash',image.source_sha256,
  'tags',coalesce((select jsonb_agg(t.tag order by t.tag) from (select tag from public.artwork_tags where artwork_id=a.id order by tag limit 20) t),'[]'::jsonb),
  'tagHash',(select encode(sha256(convert_to(coalesce(string_agg(tag,',' order by tag),''),'UTF8')),'hex') from public.artwork_tags where artwork_id=a.id),
  'analysisEvidence',(select jsonb_build_object('provider',left(an.provider,100),'model',left(an.model,100),
    'summary',left(an.description,1000),'method','VISION') from public.artwork_analyses an
    where an.artwork_id=a.id and an.analysis_method='VISION' and an.analysis_status='SUCCEEDED' and an.source_sha256=image.source_sha256),
  'uniqueEngagement',engagements,'previousExposure',exposures,'eligible',cardinality(reasons)=0,'reasons',to_jsonb(reasons));
 return payload;
end $$;
revoke all on function private.selection_evidence(uuid) from public,anon,authenticated,service_role;

create function private.selection_fingerprint(e jsonb) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(e::text,'UTF8')),'hex');
$$;
revoke all on function private.selection_fingerprint(jsonb) from public,anon,authenticated,service_role;

create function private.selection_score(e jsonb,p_as_of timestamptz) returns jsonb
language plpgsql immutable set search_path='' as $$
declare completeness numeric; engagement numeric; freshness numeric; exposure numeric;
begin
 completeness:=(case when char_length(trim(e->>'title'))>=3 then 8 else 0 end)
  +(case when (e->>'descriptionLength')::integer>=40 then 12 else 0 end)
  +(case when e->>'category' is not null then 5 else 0 end)
  +(case when e->>'imagePath' is not null then 10 else 0 end)
  +(case when jsonb_array_length(e->'tags')>0 then 5 else 0 end);
 engagement:=20.0*(e->>'uniqueEngagement')::numeric/((e->>'uniqueEngagement')::numeric+5);
 freshness:=20*greatest(0,least(1,1-extract(epoch from (p_as_of-(e->>'createdAt')::timestamptz))/5184000));
 exposure:=15.0/(1+(e->>'previousExposure')::numeric);
 return jsonb_build_object('listing',round(completeness,3),'engagement',round(engagement,3),
  'freshness',round(freshness,3),'exposureFairness',round(exposure,3),'inventory',5,
  'total',round(completeness+engagement+freshness+exposure+5,3));
end $$;
revoke all on function private.selection_score(jsonb,timestamptz) from public,anon,authenticated,service_role;

-- Civil-time calculation: exactly three local calendar days before auction
-- start, including DST-aware configured zones. Initial business zone Kolkata.
create function private.selection_prepare_at(p_start timestamptz,p_zone text) returns timestamptz
language sql stable set search_path='' as $$ select ((p_start at time zone p_zone)-interval '3 days') at time zone p_zone; $$;
revoke all on function private.selection_prepare_at(timestamptz,text) from public,anon,authenticated,service_role;

create function private.generate_weekly_selection(p_window uuid,p_regenerate boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare w private.auction_selection_windows%rowtype; oldrun private.auction_selection_runs%rowtype;
 cfg private.weekly_selection_config%rowtype; rid uuid; generation integer; asof timestamptz:=clock_timestamp();
 art record; e jsonb; comp jsonb; n_eligible integer; n_selected integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('artvault-weekly-selection',0));
 select * into cfg from private.weekly_selection_config where singleton;
 select * into w from private.auction_selection_windows where id=p_window for update;
 if not found or w.starts_at<=asof or w.auction_id is not null then raise exception 'Selection window unavailable' using errcode='22023'; end if;
 select * into oldrun from private.auction_selection_runs where id=w.active_run_id for update;
 if oldrun.id is not null and not p_regenerate then return oldrun.id; end if;
 if oldrun.status in ('APPROVED','SCHEDULED') then raise exception 'Reject the selection before regeneration' using errcode='22023'; end if;
 select coalesce(max(r.generation),0)+1 into generation from private.auction_selection_runs r where window_id=w.id;
 insert into private.auction_selection_runs(window_id,generation,status,requested_by,captured_at)
 values(w.id,generation,'GENERATED',auth.uid(),asof) returning id into rid;
 if oldrun.id is not null then update private.auction_selection_runs set status='SUPERSEDED',updated_at=asof where id=oldrun.id; end if;
 update private.auction_selection_windows set active_run_id=rid,updated_at=asof where id=w.id;
 if auth.uid() is not null then
  insert into public.admin_logs(actor_id,action,target_type,target_id,reason)
  values(auth.uid(),'SELECTION_GENERATED','auction_selection_runs',rid,'Generated versioned heuristic ranking');
 end if;
 -- Exception subtransaction prevents partially scored runs and analysis writes.
 begin
  if (select count(*) from public.artworks)>cfg.candidate_limit then
   update private.auction_selection_runs set status='FAILED',failure_code='CANDIDATE_LIMIT' where id=rid;
   return rid;
  end if;
  for art in select id from public.artworks order by id loop
   e:=private.selection_evidence(art.id);
   comp:=case when (e->>'eligible')::boolean then private.selection_score(e,asof) else '{}'::jsonb end;
   insert into private.auction_selection_candidates(run_id,artwork_id,source_artwork_id,seller_id,eligible,reasons,fingerprint,snapshot,score,components,explanation)
   values(rid,art.id,art.id,(e->>'sellerId')::uuid,(e->>'eligible')::boolean,
    array(select jsonb_array_elements_text(e->'reasons')),private.selection_fingerprint(e),e,
    coalesce((comp->>'total')::numeric,0),comp,'Heuristic ranking: listing evidence, unique engagement, freshness and exposure fairness. This run did not execute a visual model.');
   if (e->>'eligible')::boolean then
    -- Reuse the existing analysis table, without overwriting legacy/real model
    -- findings. Heuristic findings never populate subjective visual fields.
    insert into public.artwork_analyses(artwork_id,source_sha256,provider,model,description,analysis_method,analysis_version,
     analysis_status,input_fingerprint,fallback_reason)
    values(art.id,e->>'imageHash','HEURISTIC','metadata-v1','Heuristic ranking. No image-based analysis was performed.',
     'HEURISTIC','metadata-v1','FALLBACK',private.selection_fingerprint(e),'PROVIDER_NOT_CONFIGURED')
    on conflict(artwork_id) do update set source_sha256=excluded.source_sha256,input_fingerprint=excluded.input_fingerprint,
     description=excluded.description,analysis_version=excluded.analysis_version
    where public.artwork_analyses.analysis_method='HEURISTIC';
   end if;
  end loop;
  with ranked as(select id,row_number() over(order by score desc,(snapshot->>'createdAt')::timestamptz,artwork_id) as n
   from private.auction_selection_candidates where run_id=rid and eligible)
  update private.auction_selection_candidates c set rank=r.n from ranked r where c.id=r.id;
  with diverse as(select id,rank,row_number() over(partition by seller_id order by rank) as seller_round
    from private.auction_selection_candidates where run_id=rid and eligible),
   chosen as(select id,row_number() over(order by seller_round,rank) as position from diverse order by seller_round,rank limit 5)
  update private.auction_selection_candidates c set selected_position=x.position from chosen x where c.id=x.id;
  select count(*) filter(where eligible),count(*) filter(where selected_position is not null)
   into n_eligible,n_selected from private.auction_selection_candidates where run_id=rid;
  update private.auction_selection_runs set eligible_count=n_eligible,selected_count=n_selected where id=rid;
 exception when others then
  update private.auction_selection_runs set status='FAILED',failure_code='GENERATION_FAILED',selected_count=0,eligible_count=0 where id=rid;
 end;
 return rid;
end $$;
revoke all on function private.generate_weekly_selection(uuid,boolean) from public,anon,authenticated,service_role;

create function public.configure_weekly_selection(p_enabled boolean,p_timezone text,p_weekday integer,p_local_start time,
 p_duration_hours integer default 24,p_candidate_limit integer default 250) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_enabled is null or p_timezone is null or not exists(select 1 from pg_timezone_names where name=p_timezone)
  or p_weekday is null or p_weekday not between 0 and 6 or p_local_start is null or p_duration_hours is null
  or p_duration_hours not between 1 and 72 or p_candidate_limit is null or p_candidate_limit not between 5 and 1000 then
  raise exception 'Invalid weekly schedule configuration' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('artvault-weekly-selection',0));
 update private.weekly_selection_config set enabled=p_enabled,timezone=p_timezone,weekday=p_weekday,
  local_start=p_local_start,duration_hours=p_duration_hours,candidate_limit=p_candidate_limit,updated_at=clock_timestamp() where singleton;
 insert into public.admin_logs(actor_id,action,target_type,target_id,reason)
 select auth.uid(),'WEEKLY_SELECTION_CONFIGURED','weekly_selection_config',id,'Updated weekly preparation schedule' from private.weekly_selection_config;
end $$;

create function public.generate_weekly_selection(p_starts_at timestamptz,p_regenerate boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare cfg private.weekly_selection_config%rowtype; wid uuid;
begin
 if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_starts_at is null or p_starts_at<=clock_timestamp() or p_starts_at>clock_timestamp()+interval '90 days' or p_regenerate is null then
  raise exception 'Select a future auction within 90 days' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('artvault-weekly-selection',0));
 select * into cfg from private.weekly_selection_config where singleton;
 insert into private.auction_selection_windows(starts_at,ends_at,timezone,prepare_at)
 values(p_starts_at,p_starts_at+make_interval(hours=>cfg.duration_hours),cfg.timezone,private.selection_prepare_at(p_starts_at,cfg.timezone))
 on conflict(starts_at) do nothing;
 select id into wid from private.auction_selection_windows where starts_at=p_starts_at;
 return private.generate_weekly_selection(wid,p_regenerate);
end $$;

create function private.prepare_weekly_selections(p_now timestamptz default clock_timestamp()) returns integer
language plpgsql security definer set search_path='' as $$
declare cfg private.weekly_selection_config%rowtype; localdate date; localstart timestamp; starts timestamptz; wid uuid; n integer:=0; day integer;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('artvault-weekly-selection',0)) then return 0; end if;
 select * into cfg from private.weekly_selection_config where singleton;
 if not cfg.enabled then return 0; end if;
 localdate:=(p_now at time zone cfg.timezone)::date;
 for day in 0..4 loop
  if extract(dow from localdate+day)::integer<>cfg.weekday then continue; end if;
  localstart:=(localdate+day)+cfg.local_start;
  starts:=localstart at time zone cfg.timezone;
  if starts<=p_now or private.selection_prepare_at(starts,cfg.timezone)>p_now then continue; end if;
  insert into private.auction_selection_windows(starts_at,ends_at,timezone,prepare_at)
  values(starts,starts+make_interval(hours=>cfg.duration_hours),cfg.timezone,private.selection_prepare_at(starts,cfg.timezone)) on conflict(starts_at) do nothing;
  select id into wid from private.auction_selection_windows where starts_at=starts and active_run_id is null and auction_id is null;
  if found then
   perform private.generate_weekly_selection(wid,false); n:=n+1;
  else
   -- Unexpected scoring failures get at most three versioned attempts. A pool
   -- limit failure requires explicit admin intervention, not endless retries.
   select w.id into wid from private.auction_selection_windows w join private.auction_selection_runs r on r.id=w.active_run_id
    where w.starts_at=starts and w.auction_id is null and r.status='FAILED' and r.failure_code='GENERATION_FAILED' and r.generation<3;
   if found then perform private.generate_weekly_selection(wid,true); n:=n+1; end if;
  end if;
 end loop;
 return n;
end $$;
revoke all on function private.prepare_weekly_selections(timestamptz) from public,anon,authenticated,service_role;

create function public.review_weekly_selection(p_run_id uuid,p_action text,p_reason text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare r private.auction_selection_runs%rowtype; c record;
begin
 if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_action is null or p_action not in ('APPROVE','REJECT','REGENERATE','REFRESH') or char_length(coalesce(p_reason,''))>1000 then raise exception 'Invalid review action' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('artvault-weekly-selection',0));
 select x.* into r from private.auction_selection_runs x join private.auction_selection_windows w on w.active_run_id=x.id where x.id=p_run_id for update of x;
 if not found or r.status in ('SCHEDULED','SUPERSEDED') then raise exception 'Selection cannot be changed' using errcode='22023'; end if;
 if p_action='REGENERATE' then return private.generate_weekly_selection(r.window_id,true); end if;
 if p_action='REFRESH' then return r.id; end if; -- Read RPC computes current eligibility; snapshots stay immutable.
 if p_action='APPROVE' then
  if r.status='APPROVED' then return r.id; end if;
  if r.status<>'GENERATED' or r.selected_count=0 then raise exception 'A nonempty generated selection is required' using errcode='22023'; end if;
  for c in select * from private.auction_selection_candidates where run_id=r.id and selected_position is not null loop
   if c.fingerprint<>private.selection_fingerprint(private.selection_evidence(c.artwork_id)) then raise exception 'Selection is stale; reject and regenerate' using errcode='22023'; end if;
  end loop;
 end if;
 if p_action='REJECT' and r.status='REJECTED' then return r.id; end if;
 update private.auction_selection_runs set status=case p_action when 'APPROVE' then 'APPROVED' else 'REJECTED' end,
  reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),review_reason=nullif(trim(p_reason),'') where id=r.id;
 insert into public.admin_logs(actor_id,action,target_type,target_id,reason)
 values(auth.uid(),'SELECTION_'||p_action,'auction_selection_runs',r.id,coalesce(nullif(trim(p_reason),''),'Admin reviewed weekly ranking'));
 return r.id;
end $$;

-- Atomic five-lot event creation. All schedulers take the same advisory gate.
-- Metadata SHARE locks precede inventory locks; no existing auction/lot row is
-- locked, avoiding the ORDER -> LOT payment/expiry lock chain.
create function private.lock_selection_sources(p_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 if cardinality(p_ids) not between 1 and 5 then raise exception 'Invalid scheduling batch' using errcode='22023'; end if;
 perform 1 from public.profiles p where p.id in(select seller_id from public.artworks where id=any(p_ids)) order by p.id for share;
 perform 1 from public.seller_profiles s where s.id in(select seller_id from public.artworks where id=any(p_ids)) order by s.id for share;
 perform 1 from public.artworks a where a.id=any(p_ids) order by a.id for share;
 perform 1 from public.artwork_images im where im.artwork_id=any(p_ids) order by im.id for share;
 perform 1 from storage.objects o where o.bucket_id='artwork-images' and o.name in(
  select im.object_path from public.artwork_images im where im.artwork_id=any(p_ids)) order by o.id for share;
 perform 1 from public.inventory i where i.artwork_id=any(p_ids) order by i.artwork_id for update;
end $$;
revoke all on function private.lock_selection_sources(uuid[]) from public,anon,authenticated,service_role;

create function public.schedule_weekly_selection(p_run_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r private.auction_selection_runs%rowtype; w private.auction_selection_windows%rowtype; c record; event_id uuid; cfg private.weekly_selection_config%rowtype;
begin
 if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then raise exception 'Administrator access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('artvault-weekly-selection',0));
 perform pg_advisory_xact_lock(hashtextextended('artvault-auction-scheduling',0));
 select * into r from private.auction_selection_runs where id=p_run_id for update;
 select * into w from private.auction_selection_windows where id=r.window_id for update;
 if r.status='SCHEDULED' and w.auction_id is not null then return w.auction_id; end if;
 if r.id is null or r.status<>'APPROVED' or w.active_run_id<>r.id or w.auction_id is not null or w.starts_at<=clock_timestamp() then
  raise exception 'An approved future selection is required' using errcode='22023'; end if;
 perform private.lock_selection_sources(array(select artwork_id from private.auction_selection_candidates where run_id=r.id and selected_position is not null));
 for c in select * from private.auction_selection_candidates where run_id=r.id and selected_position is not null order by selected_position loop
  if c.fingerprint<>private.selection_fingerprint(private.selection_evidence(c.artwork_id)) then raise exception 'Selection is stale; reject and regenerate' using errcode='22023'; end if;
 end loop;
 -- Source locks can wait behind checkout or moderation. Recheck authoritative
 -- time after waiting rather than schedule a window that has already started.
 if w.starts_at<=clock_timestamp() then raise exception 'Auction start has passed' using errcode='22023'; end if;
 select * into cfg from private.weekly_selection_config where singleton;
 insert into public.auctions(starts_at,ends_at,status,currency) values(w.starts_at,w.ends_at,'SCHEDULED','INR') returning id into event_id;
 insert into public.auction_items(auction_id,artwork_id,seller_id,quantity,starting_bid_minor,bid_increment_minor,payment_window_hours)
 select event_id,artwork_id,seller_id,1,(snapshot->>'priceMinor')::bigint,
  greatest(100,ceil((snapshot->>'priceMinor')::numeric*0.05)::bigint),cfg.payment_window_hours
 from private.auction_selection_candidates where run_id=r.id and selected_position is not null order by selected_position;
 update private.auction_selection_windows set auction_id=event_id,updated_at=clock_timestamp() where id=w.id;
 update private.auction_selection_runs set status='SCHEDULED',updated_at=clock_timestamp() where id=r.id;
 insert into public.admin_logs(actor_id,action,target_type,target_id,reason)
 values(auth.uid(),'WEEKLY_SELECTION_SCHEDULED','auctions',event_id,'Atomic approved weekly selection');
 return event_id;
end $$;

-- Preserve the old implementation but close the single-vs-batch scheduling race.
alter function public.schedule_auction_lot(uuid,timestamptz,timestamptz,bigint,bigint,integer) set schema private;
alter function private.schedule_auction_lot(uuid,timestamptz,timestamptz,bigint,bigint,integer) rename to schedule_single_auction_lot;
revoke all on function private.schedule_single_auction_lot(uuid,timestamptz,timestamptz,bigint,bigint,integer) from public,anon,authenticated,service_role;
create function public.schedule_auction_lot(p_artwork_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_starting_bid_minor bigint,
 p_bid_increment_minor bigint,p_payment_window_hours integer default 24) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then raise exception 'Administrator access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('artvault-auction-scheduling',0));
 perform private.lock_selection_sources(array[p_artwork_id]);
 if not (private.selection_evidence(p_artwork_id)->>'eligible')::boolean then raise exception 'Artwork is not eligible for scheduling' using errcode='22023'; end if;
 return private.schedule_single_auction_lot(p_artwork_id,p_starts_at,p_ends_at,p_starting_bid_minor,p_bid_increment_minor,p_payment_window_hours);
end $$;

create function public.get_weekly_selections(p_run_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_role(array['ADMIN','SUPER_ADMIN']::public.app_role[]) then raise exception 'Administrator access required' using errcode='42501'; end if;
 return jsonb_build_object('config',(select to_jsonb(c) from private.weekly_selection_config c where singleton),
  'runs',coalesce((select jsonb_agg(x.data order by x.captured_at desc,x.generation desc,x.id) from (
   select r.captured_at,r.generation,r.id,to_jsonb(r)||jsonb_build_object('window',to_jsonb(w)) as data
   from private.auction_selection_runs r join private.auction_selection_windows w on w.id=r.window_id order by r.captured_at desc,r.generation desc,r.id limit 20
  ) x),'[]'::jsonb),
  'candidates',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object(
   'stale',c.fingerprint<>private.selection_fingerprint(private.selection_evidence(c.artwork_id)),
   'currentReasons',private.selection_evidence(c.artwork_id)->'reasons') order by c.selected_position nulls last,c.rank nulls last,c.artwork_id)
   from private.auction_selection_candidates c where c.run_id=coalesce(p_run_id,
    (select id from private.auction_selection_runs order by captured_at desc,generation desc,id limit 1))),'[]'::jsonb));
end $$;

revoke all on function public.configure_weekly_selection(boolean,text,integer,time,integer,integer),
 public.generate_weekly_selection(timestamptz,boolean),public.review_weekly_selection(uuid,text,text),
 public.schedule_weekly_selection(uuid),public.get_weekly_selections(uuid),
 public.schedule_auction_lot(uuid,timestamptz,timestamptz,bigint,bigint,integer) from public,anon,authenticated;
grant execute on function public.configure_weekly_selection(boolean,text,integer,time,integer,integer),
 public.generate_weekly_selection(timestamptz,boolean),public.review_weekly_selection(uuid,text,text),
 public.schedule_weekly_selection(uuid),public.get_weekly_selections(uuid),
 public.schedule_auction_lot(uuid,timestamptz,timestamptz,bigint,bigint,integer) to authenticated;
-- Separate job; Module 05 lifecycle/expiry jobs are untouched. Configuration is
-- disabled until an authorized admin explicitly chooses the business schedule.
select cron.schedule('artvault-prepare-weekly-selection','*/10 * * * *','select private.prepare_weekly_selections();');
commit;
