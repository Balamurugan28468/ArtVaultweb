-- Local only. Reuses existing AI conversations/messages and public catalog
-- contracts. No hosted execution, provider calls, cron or inventory changes.
begin;

create function private.support_active_user() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id=auth.uid() and p.status='ACTIVE' and u.email_confirmed_at is not null);
$$;
revoke all on function private.support_active_user() from public,anon,authenticated,service_role;
grant execute on function private.support_active_user() to authenticated;

create table private.support_faq (
 id uuid primary key default gen_random_uuid(), topic text not null unique,
 priority integer not null unique, keywords text[] not null,
 content text not null check(char_length(content) between 1 and 1800),
 links jsonb not null check(jsonb_typeof(links)='array' and jsonb_array_length(links)<=3),
 created_at timestamptz not null default now()
);
alter table private.support_faq enable row level security;
revoke all on private.support_faq from public,anon,authenticated,service_role;
insert into private.support_faq(topic,priority,keywords,content,links) select f->>'topic',n::integer,array(select jsonb_array_elements_text(f->'keywords')),f->>'content',f->'links' from jsonb_array_elements('[{"topic":"security","keywords":["ignore instructions","ignore rules","another user","someone else","service role","system prompt","make me admin"],"content":"I can explain ArtVault workflows, but I cannot access another person''s private information or change roles, payments, orders or stock. Never share passwords, OTPs or payment credentials here.","links":[{"label":"Your account","href":"/account"}]},{"topic":"auth","keywords":["register","sign up","signup","sign in","login","password","otp","email verification"],"content":"Use Sign Up, enter your details and send the email OTP. Verify the complete code, then choose Create Account. Sign in manually using the exact registered email. Never share your password or OTP in chat.","links":[{"label":"Sign up","href":"/sign-up"},{"label":"Sign in","href":"/sign-in"}]},{"topic":"payment","keywords":["razorpay","payment","paid","refund","upi","card"],"content":"ArtVault currently supports Razorpay TEST payments only. Open your unpaid order to see eligible test-payment actions. Only trusted server verification can confirm payment; a browser success screen alone is not proof. UPI/live payments and automated refunds are not offered here. I do not read or change your payment status.","links":[{"label":"My orders","href":"/orders"}]},{"topic":"checkout","keywords":["checkout","shipping address","saved address","unpaid order","reservation"],"content":"Choose a complete saved shipping address before creating an unpaid order. Prices and available stock are validated by the server. Reservations have a payment deadline and are released by trusted expiry processing. If the window expires, use the existing recovery flow; chat cannot reactivate it.","links":[{"label":"Checkout","href":"/checkout"},{"label":"Saved addresses","href":"/account/addresses"}]},{"topic":"orders","keywords":["order","tracking","shipment","delivery","cancel"],"content":"Sign in and open My Orders for your own current order, payment and shipment information. Shipping is manual tracking where provided. TEST purchases cannot be dispatched as real purchases. I cannot look up, cancel or change an order in this chat.","links":[{"label":"My orders","href":"/orders"},{"label":"Sign in","href":"/sign-in"}]},{"topic":"cart","keywords":["cart","basket","buy"],"content":"Open an artwork and add an available item to your cart. Review quantities and totals, then sign in to checkout with a saved address. Adding to cart does not reserve stock; availability is checked again by the server.","links":[{"label":"Your cart","href":"/cart"},{"label":"Explore artworks","href":"/explore"}]},{"topic":"auctions","keywords":["auction","bid","winner","weekly"],"content":"Open Auctions for the current schedule and eligible lots. Bids must meet the server''s minimum and time window; sellers cannot bid on their own work. Only the winning account can open winner checkout. Chat cannot place bids, reveal private bidder IDs or invent auction results.","links":[{"label":"Auctions","href":"/auctions"}]},{"topic":"ar","keywords":["ar","webxr","wall placement","lock position","frame"],"content":"Open a published artwork and choose View in AR when its asset and your device are supported. Android WebXR requires a compatible device and secure connection. Reposition and resize, then Lock Position; Unlock Position lets you move it again. Displayed dimensions are estimated, not camera-measured.","links":[{"label":"Find an artwork for AR","href":"/explore"}]},{"topic":"seller","keywords":["seller","sell","upload","publish","moderation"],"content":"Apply to become a seller from your account. Approved sellers use Seller Studio to create drafts, upload images and submit work for trusted admin moderation. Submitting does not publish automatically. Chat cannot approve sellers or publish artworks.","links":[{"label":"Seller application","href":"/seller/apply"},{"label":"Seller Studio","href":"/seller-studio"}]},{"topic":"analysis","keywords":["analysis","analyze","composition","authenticity","artistic score"],"content":"Open an artwork''s analysis page for available supported findings. Heuristic ranking uses metadata and engagement; it is not visual AI analysis, an authenticity certificate or an objective artistic-quality score. No visual model is connected to this assistant.","links":[{"label":"Explore artworks","href":"/explore"}]},{"topic":"artists","keywords":["artist","creator","biography"],"content":"Use the artist link on an artwork to open the artist''s public profile. Follow artists you like to shape your recommendations. I do not invent biographies or claims about an artist''s identity.","links":[{"label":"Discover artists through their artwork","href":"/explore"},{"label":"Recommendations","href":"/recommendations"}]},{"topic":"discovery","keywords":["recommend","wishlist","like","follow","trending","new artwork","category","abstract","painting","artwork"],"content":"Explore supports search, categories and price filters. Recommendations use eligible published artworks, real engagement and your own likes, wishlist and follows when signed in. Guest discovery uses public signals. These are explainable heuristic suggestions, not deep-learning personalization.","links":[{"label":"Explore artworks","href":"/explore"},{"label":"Recommendations","href":"/recommendations"},{"label":"Wishlist","href":"/wishlist"}]},{"topic":"general","keywords":[],"content":"I provide local FAQ guidance about ArtVault, not live AI-generated answers. Ask about signup, artists, artworks, cart, checkout, orders, TEST payments, auctions or AR. For current prices and availability, open the corresponding ArtVault page.","links":[{"label":"Explore","href":"/explore"},{"label":"My orders","href":"/orders"}]}]'::jsonb) with ordinality as entries(f,n);

alter table public.ai_messages add column method text check(method in ('FAQ','MODEL')),
 add column links jsonb not null default '[]' check(jsonb_typeof(links)='array' and jsonb_array_length(links)<=3);
create table private.assistant_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null, body_hash text not null check(body_hash ~ '^[a-f0-9]{64}$'),
 conversation_id uuid references public.ai_conversations(id) on delete set null,
 user_message_id uuid references public.ai_messages(id) on delete set null,
 assistant_message_id uuid references public.ai_messages(id) on delete set null,
 created_at timestamptz not null default clock_timestamp(), unique(user_id,request_id)
);
alter table private.assistant_requests enable row level security;
revoke all on private.assistant_requests from public,anon,authenticated,service_role;
create index assistant_requests_rate on private.assistant_requests(user_id,created_at desc);
create index assistant_history_recent on public.ai_conversations(user_id,updated_at desc,id);

-- Only the trusted FAQ operation creates messages/conversations. Ownership
-- reads/deletion remain available, including direct Data API privacy boundaries.
revoke insert,update on public.ai_conversations from authenticated;
revoke insert(user_id,title),update(title) on public.ai_conversations from authenticated;
drop policy conversations_own on public.ai_conversations;
create policy support_conversations_read on public.ai_conversations for select to authenticated
 using(user_id=(select auth.uid()) and private.support_active_user());
create policy support_conversations_delete on public.ai_conversations for delete to authenticated
 using(user_id=(select auth.uid()) and private.support_active_user());
drop policy messages_own_read on public.ai_messages;
create policy support_messages_read on public.ai_messages for select to authenticated
 using(role<>'SYSTEM' and private.support_active_user() and exists(
  select 1 from public.ai_conversations c where c.id=conversation_id and c.user_id=(select auth.uid())));

create function private.support_request_response(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('conversationId',r.conversation_id,'messages',(
  select jsonb_agg(jsonb_build_object('id',m.id,'role',m.role,'content',m.content,'sequence',m.sequence,'method',m.method,'links',m.links) order by m.sequence)
  from public.ai_messages m where m.id in(r.user_message_id,r.assistant_message_id) and m.role in('USER','ASSISTANT')))
 from private.assistant_requests r where r.id=p_id and r.user_id=auth.uid();
$$;
revoke all on function private.support_request_response(uuid) from public,anon,authenticated,service_role;

create function public.send_assistant_message(p_message text,p_request_id uuid,p_conversation_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare question text:=trim(p_message); uid uuid:=auth.uid(); c uuid; seq integer; faq private.support_faq%rowtype;
 prior private.assistant_requests%rowtype; rid uuid; user_msg uuid; assistant_msg uuid; digest text;
begin
 if not private.support_active_user() then raise exception 'Sign in with an active verified account' using errcode='42501'; end if;
 if question is null or char_length(question) not between 1 and 1000 or p_request_id is null then
  raise exception 'Enter a question between 1 and 1,000 characters.' using errcode='22023'; end if;
 if question ~* 'sb_secret_|-----BEGIN .*PRIVATE KEY|(password|otp)[[:space:]]*[:=][[:space:]]*[^[:space:]]' then
  raise exception 'Do not share credentials or verification codes in chat.' using errcode='22023'; end if;
 -- One profile lock serializes quota, conversation creation and sequence allocation.
 perform 1 from public.profiles where id=uid for update;
 if not private.support_active_user() then raise exception 'Account unavailable' using errcode='42501'; end if;
 digest:=encode(sha256(convert_to(jsonb_build_array(question,p_conversation_id)::text,'UTF8')),'hex');
 select * into prior from private.assistant_requests where user_id=uid and request_id=p_request_id;
 if found then
  if prior.body_hash<>digest or prior.conversation_id is null then raise exception 'Request cannot be replayed. Start a new chat.' using errcode='22023'; end if;
  return private.support_request_response(prior.id);
 end if;
 if (select count(*) from private.assistant_requests where user_id=uid and created_at>clock_timestamp()-interval '1 minute')>=10
  or (select count(*) from private.assistant_requests where user_id=uid and created_at>clock_timestamp()-interval '1 day')>=200 then
  raise exception 'Too many questions. Please wait and try again.' using errcode='22023'; end if;
 if p_conversation_id is null then
  insert into public.ai_conversations(user_id,title) values(uid,'ArtVault support chat') returning id into c;
 else
  select id into c from public.ai_conversations where id=p_conversation_id and user_id=uid for update;
  if not found then raise exception 'Conversation unavailable' using errcode='42501'; end if;
 end if;
 select coalesce(max(sequence),0)+1 into seq from public.ai_messages where conversation_id=c;
 if seq>199 then raise exception 'This conversation is full. Start a new chat.' using errcode='22023'; end if;
 select f.* into faq from private.support_faq f where exists(
  select 1 from unnest(f.keywords) k where lower(question) ~ ('(^|[^a-z0-9])'||k||'([^a-z0-9]|$)'))
 order by (select max(length(k)) from unnest(f.keywords) k where lower(question) ~ ('(^|[^a-z0-9])'||k||'([^a-z0-9]|$)')) desc,f.priority limit 1;
 if not found then select * into faq from private.support_faq where topic='general'; end if;
 insert into public.ai_messages(conversation_id,sequence,role,content) values(c,seq,'USER',question) returning id into user_msg;
 insert into public.ai_messages(conversation_id,sequence,role,content,provider,model,method,links)
 values(c,seq+1,'ASSISTANT',faq.content,'RULE_BASED','artvault-faq-v1','FAQ',faq.links) returning id into assistant_msg;
 insert into private.assistant_requests(user_id,request_id,body_hash,conversation_id,user_message_id,assistant_message_id)
 values(uid,p_request_id,digest,c,user_msg,assistant_msg) returning id into rid;
 update public.ai_conversations set updated_at=clock_timestamp() where id=c;
 return private.support_request_response(rid);
end $$;

create function public.get_assistant_history() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.support_active_user() then raise exception 'Sign in required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(c) order by c.updated_at desc,c.id) from(
  select id,title,updated_at from public.ai_conversations where user_id=auth.uid() order by updated_at desc,id limit 20)c),'[]');
end $$;
create function public.get_assistant_conversation(p_conversation_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.support_active_user() or not exists(select 1 from public.ai_conversations where id=p_conversation_id and user_id=auth.uid()) then
  raise exception 'Conversation unavailable' using errcode='42501'; end if;
 return jsonb_build_object('id',p_conversation_id,'messages',coalesce((select jsonb_agg(to_jsonb(m) order by m.sequence) from(
  select id,role,content,sequence,method,links from public.ai_messages where conversation_id=p_conversation_id and role in('USER','ASSISTANT') order by sequence desc limit 100)m),'[]'));
end $$;
revoke all on function public.send_assistant_message(text,uuid,uuid),public.get_assistant_history(),public.get_assistant_conversation(uuid) from public,anon,authenticated;
grant execute on function public.send_assistant_message(text,uuid,uuid),public.get_assistant_history(),public.get_assistant_conversation(uuid) to authenticated;

-- Buyer-facing ranking is independent of Module 06's auction selection.
-- Only own interests are consulted. Other people's interaction IDs never leave
-- the aggregate. The candidate scan, return size and pagination are bounded.
create function public.get_artwork_recommendations(p_mode text default 'for-you',p_anchor_id uuid default null,
 p_offset integer default 0,p_limit integer default 12,p_as_of timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cutoff timestamptz:=coalesce(p_as_of,statement_timestamp()); viewer uuid; response jsonb;
begin
 if p_mode is null or p_mode not in('for-you','related','trending','following','liked','new') or p_offset is null or p_offset not between 0 and 499
  or p_limit is null or p_limit not between 1 and 20 or cutoff>statement_timestamp()+interval '1 minute' or cutoff<statement_timestamp()-interval '7 days' then
  raise exception 'Invalid recommendation request' using errcode='22023'; end if;
 if private.support_active_user() then viewer:=auth.uid(); end if;
 with eligible as materialized (
  select a.*,c.slug as category,i.physical_quantity,i.reserved_quantity,media.images,media.image_hash,
   an.style,
   greatest(0,least(1,1-extract(epoch from(cutoff-a.created_at))/5184000)) as fresh
  from public.artworks a join public.categories c on c.id=a.category_id
  join public.seller_profiles s on s.id=a.seller_id and s.status='APPROVED'
  join public.profiles p on p.id=s.id and p.status='ACTIVE'
  join public.inventory i on i.artwork_id=a.id and i.available_quantity>0
  join lateral (select jsonb_agg(jsonb_build_object('id',m.id,'path',m.object_path,'order',m.position,'contentType',m.content_type,'size',m.byte_size) order by m.position,m.id) as images,
   (array_agg(m.source_sha256 order by m.position,m.id))[1] as image_hash from public.artwork_images m
   where m.artwork_id=a.id and m.content_type in('image/jpeg','image/png','image/webp') and m.source_sha256 ~ '^[a-f0-9]{64}$'
   and exists(select 1 from storage.objects o where o.bucket_id=m.bucket_id and o.name=m.object_path)) media on jsonb_array_length(media.images)>0
  left join public.artwork_analyses an on an.artwork_id=a.id and an.analysis_method='VISION' and an.analysis_status='SUCCEEDED' and an.source_sha256=media.image_hash
  where a.status='PUBLISHED' and a.currency='INR' and a.price_minor between 100 and 9007199254740991 and a.created_at<=cutoff
   and (viewer is null or a.seller_id<>viewer)
  order by a.created_at desc,a.id limit 500
 ), interests as materialized (
  select w.artwork_id,'wishlist' as source from public.wishlist_items w where w.user_id=viewer
  union select l.artwork_id,'liked' from public.likes l where l.user_id=viewer
 ), anchor as (
  select a.id,a.category_id,an.style from public.artworks a
  join public.seller_profiles s on s.id=a.seller_id and s.status='APPROVED'
  join public.profiles p on p.id=s.id and p.status='ACTIVE'
  left join public.artwork_analyses an on an.artwork_id=a.id and an.analysis_method='VISION' and an.analysis_status='SUCCEEDED'
   and exists(select 1 from public.artwork_images im where im.artwork_id=a.id and im.source_sha256=an.source_sha256
    and exists(select 1 from storage.objects o where o.bucket_id=im.bucket_id and o.name=im.object_path))
  where a.id=p_anchor_id and a.status='PUBLISHED'
 ), enriched as (
  select a.*,
   (select count(*) from (select user_id from public.likes where artwork_id=a.id union select user_id from public.wishlist_items where artwork_id=a.id)e
    join public.profiles p on p.id=e.user_id where p.status='ACTIVE' and e.user_id<>a.seller_id) as engagement,
   exists(select 1 from interests t join public.artworks origin on origin.id=t.artwork_id and origin.status='PUBLISHED' where t.source='wishlist' and origin.category_id=a.category_id) as wish_match,
   exists(select 1 from interests t join public.artworks origin on origin.id=t.artwork_id and origin.status='PUBLISHED' where t.source='liked' and origin.category_id=a.category_id) as like_match,
   exists(select 1 from public.follows f where f.user_id=viewer and f.artist_id=a.seller_id) as follow_match,
   exists(select 1 from public.artwork_tags x join public.artwork_tags y on x.tag=y.tag join interests t on t.artwork_id=y.artwork_id
    join public.artworks origin on origin.id=y.artwork_id and origin.status='PUBLISHED' where x.artwork_id=a.id) as tag_match,
   exists(select 1 from anchor b where b.category_id=a.category_id) as related_category,
   exists(select 1 from anchor b where b.style is not null and b.style=a.style) as related_style,
   exists(select 1 from public.artwork_tags x join public.artwork_tags y on x.tag=y.tag where x.artwork_id=a.id and y.artwork_id=p_anchor_id and exists(select 1 from anchor)) as related_tag
  from eligible a where a.id is distinct from p_anchor_id and(p_mode not in('for-you','related','liked') or not exists(select 1 from interests t where t.artwork_id=a.id))
 ), scored as (
  select e.*,
   round(case
    when p_mode='new' then 100*fresh
    when p_mode='trending' then 80.0*engagement/(engagement+5)+20*fresh
    when p_mode in('related','for-you') and p_anchor_id is not null and(viewer is null or p_mode='related') then 15.0*engagement/(engagement+5)+15*fresh+case when related_category then 40 else 0 end+case when related_tag then 15 else 0 end+case when related_style then 15 else 0 end
    when p_mode='following' then 15.0*engagement/(engagement+5)+15*fresh+case when follow_match then 70 else 0 end
    when p_mode='liked' then 15.0*engagement/(engagement+5)+15*fresh+case when like_match then 65 else 0 end+case when tag_match then 5 else 0 end
    else 15.0*engagement/(engagement+5)+15*fresh+case when wish_match then 25 else 0 end+case when like_match then 20 else 0 end+case when follow_match then 15 else 0 end+case when tag_match then 10 else 0 end end,3) as score,
   case when p_mode in('related','for-you') and p_anchor_id is not null and related_style then 'Similar supported style'
    when p_mode in('related','for-you') and p_anchor_id is not null and related_category then 'Similar category'
    when p_mode in('related','for-you') and p_anchor_id is not null and related_tag then 'Shared listing tags'
    when p_mode in('for-you','related','following') and follow_match then 'From an artist you follow'
    when p_mode in('for-you','related') and wish_match then 'Based on your wishlist'
    when p_mode in('for-you','related','liked') and like_match then 'Based on your likes'
    when p_mode in('for-you','related','liked') and tag_match then 'Based on your saved interests'
    when p_mode='trending' and engagement>0 then 'Real marketplace engagement' else 'New artwork discovery' end as reason,
   (viewer is not null and ((p_mode in('for-you','related') and (wish_match or like_match or follow_match or tag_match)) or (p_mode='following' and follow_match) or(p_mode='liked' and (like_match or tag_match)))) as personalized
  from enriched e
 ), diversity as (
  select s.*,row_number() over(partition by seller_id order by score desc,created_at desc,id) as seller_round from scored s
 ), ranked as (
  select d.*,row_number() over(order by seller_round,score desc,created_at desc,id) as position from diversity d
 ), page as (select * from ranked where position>p_offset and position<=p_offset+p_limit)
 select jsonb_build_object('method','HEURISTIC','asOf',cutoff,'personalized',coalesce((select bool_or(personalized) from page),false),
  'nextOffset',case when (select count(*) from ranked)>p_offset+p_limit then p_offset+p_limit else null end,
  'items',coalesce((select jsonb_agg(jsonb_build_object('score',score,'reason',reason,'artwork',jsonb_build_object(
   'id',id,'seller_id',seller_id,'title',title,'description',description,'price_minor',price_minor,'currency',currency,'category',category,
   'status',status,'physical_quantity',physical_quantity,'reserved_quantity',reserved_quantity,'like_count',public.artwork_like_count(id),
   'created_at',created_at,'updated_at',updated_at,'images',images,'tags',coalesce((select jsonb_agg(tag order by tag) from public.artwork_tags where artwork_id=page.id),'[]')))
   order by position) from page),'[]')) into response;
 return response;
end $$;
revoke all on function public.get_artwork_recommendations(text,uuid,integer,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.get_artwork_recommendations(text,uuid,integer,integer,timestamptz) to anon,authenticated;
commit;
