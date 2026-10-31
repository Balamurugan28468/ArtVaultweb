import assert from 'node:assert/strict'
import { test } from 'node:test'

export function registerWeeklySelectionTests({db,rows,buyer,other,seller,seller2,admin,category}){
  async function fixture(run,count=6){
    await db.exec('begin')
    const as=async(uid,operation,role='authenticated')=>{
      await db.exec(`set local role ${role}`)
      await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid??''])
      try{return await operation()}finally{await db.exec('reset role').catch(()=>{})}
    }
    const rejected=async(uid,sql,params=[],code='42501',role='authenticated')=>as(uid,async()=>{
      await db.exec('savepoint rejection')
      try{await assert.rejects(db.query(sql,params),e=>e.code===code)}finally{await db.exec('rollback to savepoint rejection;release savepoint rejection')}
    },role)
    try{
      await db.query("update public.artworks set status='DRAFT'")
      const artworks=[]
      for(let i=0;i<count;i++){
        const owner=i%2?seller2:seller
        const [art]=await rows("insert into public.artworks(seller_id,category_id,title,description,price_minor,status,created_at) values($1,$2,$3,$4,$5,'PUBLISHED',now()-make_interval(days=>$6)) returning id",[owner,category,`Selection work ${i}`,`A complete listing with verified artist information and a detailed artwork description ${i}.`,100000+i*1000,i])
        const path=`${owner}/${art.id}/front.png`
        await db.query('insert into public.inventory(artwork_id,physical_quantity) values($1,1)',[art.id])
        await db.query("insert into public.artwork_images(artwork_id,object_path,position,content_type,byte_size,source_sha256) values($1,$2,0,'image/png',100,repeat('d',64))",[art.id,path])
        await db.query("insert into storage.objects(bucket_id,name) values('artwork-images',$1)",[path])
        artworks.push({...art,owner,path})
      }
      const starts=new Date(Date.now()+4*86400000).toISOString()
      const generate=async(regenerate=false)=>as(admin,async()=> (await rows('select public.generate_weekly_selection($1,$2) as id',[starts,regenerate]))[0].id)
      const dashboard=async(id)=>as(admin,async()=> (await rows('select public.get_weekly_selections($1) as data',[id??null]))[0].data)
      const review=(id,action)=>as(admin,()=>rows('select public.review_weekly_selection($1,$2,$3)',[id,action,'Isolated fixture review']))
      const schedule=async id=>as(admin,async()=> (await rows('select public.schedule_weekly_selection($1) as id',[id]))[0].id)
      const evidence=async id=>(await rows('select private.selection_evidence($1) as data',[id]))[0].data
      await run({as,rejected,artworks,starts,generate,dashboard,review,schedule,evidence})
    }finally{await db.exec('rollback');await db.exec('reset role')}
  }
  test('Module 06: eligibility checks authoritative publication, seller, stock, media and conflict state',()=>fixture(async f=>{
    const [a,b,c,d,e,g]=f.artworks
    assert.equal((await f.evidence(a.id)).eligible,true)
    await db.query("update public.artworks set status='DRAFT' where id=$1",[a.id])
    assert.ok((await f.evidence(a.id)).reasons.includes('NOT_PUBLISHED'))
    await db.query("update public.artworks set status='REJECTED' where id=$1",[a.id])
    assert.equal((await f.evidence(a.id)).eligible,false)
    await db.query("update public.artworks set status='SUSPENDED' where id=$1",[a.id])
    assert.equal((await f.evidence(a.id)).eligible,false)
    await db.query('update public.inventory set physical_quantity=0 where artwork_id=$1',[b.id])
    assert.ok((await f.evidence(b.id)).reasons.includes('INSUFFICIENT_AVAILABLE_STOCK'))
    await db.query('update public.inventory set reserved_quantity=1 where artwork_id=$1',[c.id])
    assert.equal((await f.evidence(c.id)).eligible,false)
    await db.query('delete from storage.objects where name=$1',[d.path])
    assert.ok((await f.evidence(d.id)).reasons.includes('VALID_IMAGE_REQUIRED'))
    await db.query("update public.artwork_images set source_sha256=null where artwork_id=$1",[e.id])
    assert.equal((await f.evidence(e.id)).eligible,false)
    const [event]=await rows("insert into public.auctions(starts_at,ends_at,status) values(now()+interval '1 hour',now()+interval '2 hours','SCHEDULED') returning id")
    await db.query('insert into public.auction_items(auction_id,artwork_id,seller_id,starting_bid_minor,bid_increment_minor) values($1,$2,$3,100000,1000)',[event.id,g.id,g.owner])
    assert.ok((await f.evidence(g.id)).reasons.includes('AUCTION_CONFLICT'))
    await db.query("update public.profiles set status='SUSPENDED' where id=$1",[seller])
    assert.ok((await f.evidence(c.id)).reasons.includes('SELLER_UNAVAILABLE'))
    await db.query("update public.seller_profiles set status='REJECTED',rejection_reason='Approval withdrawn' where id=$1",[seller2])
    assert.ok((await f.evidence(g.id)).reasons.includes('SELLER_UNAVAILABLE'))
  }))
  test('Module 06: unique engagement, deterministic scores, stable ties and new listing fairness',()=>fixture(async f=>{
    const a=f.artworks[0]
    await db.query('insert into public.likes(user_id,artwork_id) values($1,$2)',[buyer,a.id])
    await db.query('insert into public.wishlist_items(user_id,artwork_id) values($1,$2)',[buyer,a.id])
    await db.query('insert into public.likes(user_id,artwork_id) values($1,$2)',[seller,a.id])
    const e=await f.evidence(a.id)
    assert.equal(e.uniqueEngagement,1)
    const [scores]=await rows("select private.selection_score($1::jsonb,'2027-01-01T00:00:00Z') as first,private.selection_score($1::jsonb,'2027-01-01T00:00:00Z') as second",[JSON.stringify(e)])
    assert.deepEqual(scores.first,scores.second)
    const [fair]=await rows("select private.selection_score($1::jsonb||jsonb_build_object('createdAt','2027-01-01T00:00:00Z','uniqueEngagement',0),'2027-01-01T00:00:00Z') as new",[JSON.stringify(e)])
    assert.equal(fair.new.freshness,20)
    assert.equal(fair.new.exposureFairness,15)
    await db.query("update public.artworks set title='Same title',description='Same complete description that is comfortably more than forty characters.',created_at='2026-01-01T00:00:00Z'")
    const rid=await f.generate()
    const data=await f.dashboard(rid)
    assert.equal(data.runs[0].status,'GENERATED')
    const ranked=data.candidates.filter(c=>c.eligible).sort((x,y)=>x.rank-y.rank)
    for(let i=1;i<ranked.length;i++)assert.ok(Number(ranked[i-1].score)>=Number(ranked[i].score))
    assert.equal(data.candidates.filter(c=>c.selected_position===1).length,1)
    const selected=data.candidates.filter(c=>c.selected_position!==null)
    assert.equal(new Set(selected.slice(0,2).map(c=>c.seller_id)).size,2)
    const tie=ranked.filter(c=>Number(c.score)===Number(ranked[ranked.length-1].score))
    assert.deepEqual(tie.map(c=>c.artwork_id),tie.map(c=>c.artwork_id).sort())
  }))
  for(const count of [0,3,6])test(`Module 06: selects actual min(5,${count}) with versioned history and no fake candidates`,()=>fixture(async f=>{
    const stock=await rows('select * from public.inventory order by artwork_id')
    const id=await f.generate()
    assert.equal(await f.generate(),id)
    const data=await f.dashboard(id)
    assert.equal(data.runs[0].status,'GENERATED')
    assert.equal(data.runs[0].selected_count,Math.min(count,5))
    assert.equal(data.runs[0].eligible_count,count)
    assert.equal(data.candidates.filter(c=>c.selected_position!==null).length,Math.min(count,5))
    assert.deepEqual(await rows('select * from public.inventory order by artwork_id'),stock)
    assert.equal((await rows('select count(*)::int as n from public.artwork_analyses where analysis_method=\'HEURISTIC\''))[0].n,count)
    const newId=await f.generate(true)
    assert.notEqual(newId,id)
    assert.equal((await rows('select generation from private.auction_selection_runs where id=$1',[newId]))[0].generation,2)
    assert.equal((await rows('select status from private.auction_selection_runs where id=$1',[id]))[0].status,'SUPERSEDED')
    assert.equal((await rows('select count(*)::int as n from public.artwork_analyses where analysis_method=\'HEURISTIC\''))[0].n,count)
  },count))
  test('Module 06: all admin operations and internal scoring data deny anon/customer/seller access',()=>fixture(async f=>{
    for(const [uid,role]of[[null,'anon'],[buyer,'authenticated'],[seller,'authenticated']]){
      await f.rejected(uid,'select public.generate_weekly_selection($1)',[f.starts],'42501',role)
      await f.rejected(uid,'select public.get_weekly_selections()',[],'42501',role)
      await f.rejected(uid,'select * from private.auction_selection_runs',[],'42501',role)
      await f.rejected(uid,'select private.prepare_weekly_selections()',[],'42501',role)
      await f.rejected(uid,'select public.configure_weekly_selection(true,\'Asia/Kolkata\',0,\'18:00\')',[],'42501',role)
    }
    const id=await f.generate()
    await f.rejected(buyer,"select public.review_weekly_selection($1,'APPROVE')",[id])
    await f.rejected(seller,'select public.schedule_weekly_selection($1)',[id])
    await f.rejected(buyer,"update public.artwork_analyses set analysis_method='VISION'")
  }))
  test('Module 06: atomic five-lot weekly event, idempotent approval/scheduling and protected snapshots',()=>fixture(async f=>{
    const id=await f.generate()
    await f.review(id,'APPROVE');await f.review(id,'APPROVE')
    await f.rejected(admin,'select public.generate_weekly_selection($1,true)',[f.starts],'22023')
    const before=(await rows('select count(*)::int as n from public.auctions'))[0].n
    const stock=await rows('select * from public.inventory order by artwork_id')
    const event=await f.schedule(id)
    assert.equal(await f.schedule(id),event)
    assert.equal((await rows('select count(*)::int as n from public.auctions'))[0].n,before+1)
    assert.equal((await rows('select count(*)::int as n from public.auction_items where auction_id=$1',[event]))[0].n,5)
    assert.deepEqual(await rows('select * from public.inventory order by artwork_id'),stock)
    assert.equal((await rows("select count(*)::int as n from public.admin_logs where action='SELECTION_APPROVE' and target_id=$1",[id]))[0].n,1)
    const [lot]=await rows('select * from public.auction_items where auction_id=$1 limit 1',[event])
    await f.rejected(admin,'select public.schedule_auction_lot($1,$2,$3,100000,1000)',[lot.artwork_id,f.starts,new Date(Date.parse(f.starts)+86400000).toISOString()],'22023')
    await f.as(null,async()=>{
      const list=await rows('select * from public.get_public_auctions() where id=$1',[event])
      assert.equal(list.length,5)
      for(const row of list){assert.equal(Object.hasOwn(row,'winner_bidder_id'),false);assert.equal(Object.hasOwn(row,'winner_order_id'),false)}
    },'anon')
  }))
  test('Module 06: one weekly event preserves per-lot bids, winner checkout and exactly-once TEST settlement',()=>fixture(async f=>{
    const id=await f.generate();await f.review(id,'APPROVE')
    const event=await f.schedule(id)
    const lots=await rows('select * from public.auction_items where auction_id=$1 order by id',[event])
    const lot=lots[0]
    const start=Number(lot.starting_bid_minor),winning=start+Number(lot.bid_increment_minor)
    // Time travel is confined to this disposable, rolled-back database fixture.
    await db.query("update public.auctions set starts_at=clock_timestamp()-interval '1 minute' where id=$1",[event])
    await rows('select private.run_auction_lifecycle(50)')
    assert.equal((await rows('select status from public.auctions where id=$1',[event]))[0].status,'LIVE')
    for(const [uid,amount,key]of[[buyer,start,'weekly-first'],[other,winning,'weekly-winner']]){
      assert.equal((await f.as(uid,()=>rows('select public.place_bid($1,$2,$3) as result',[lot.id,amount,key])))[0].result,'ok')
    }
    await db.query("update public.auctions set ends_at=clock_timestamp()-interval '1 microsecond' where id=$1",[event])
    await rows('select private.run_auction_lifecycle(50)')
    const closed=await rows('select * from public.auction_items where auction_id=$1',[event])
    assert.equal(closed.filter(x=>x.lot_status==='NO_BIDS').length,4)
    assert.equal(closed.find(x=>x.id===lot.id).winner_bidder_id,other)
    const [shipping]=await rows("insert into public.addresses(user_id,full_name,address_line1,city,state,postal_code,country) values($1,'Weekly Winner','123 Shipping Street','Mumbai','Maharashtra','400001','India') returning id",[other])
    await f.rejected(buyer,'select public.create_auction_winner_order($1,$2)',[lot.id,shipping.id])
    const checkout=()=>f.as(other,()=>rows('select public.create_auction_winner_order($1,$2) as id',[lot.id,shipping.id]))
    const order=(await checkout())[0].id
    assert.equal((await checkout())[0].id,order)
    const [payment]=await rows('select public.begin_razorpay_test_payment($1,$2) as value',[order,other])
    assert.equal(Number(payment.value.amount_minor),winning)
    assert.equal(payment.value.mode,'TEST')
    await db.query("select public.attach_razorpay_test_order($1,'order_weeklyFixture')",[payment.value.id])
    await db.query("select public.claim_razorpay_test_capture($1,'pay_weeklyFixture',$2,'INR')",[payment.value.id,winning])
    for(let attempt=0;attempt<2;attempt++)assert.equal((await rows("select public.record_razorpay_test_result($1,'pay_weeklyFixture',$2,'INR','captured','weekly-capture',$3) as result",[payment.value.id,winning,'a'.repeat(64)]))[0].result,'SUCCEEDED')
    await rows('select private.run_auction_lifecycle(50)')
    assert.equal((await rows('select lot_status from public.auction_items where id=$1',[lot.id]))[0].lot_status,'SETTLED')
    assert.equal((await rows('select count(*)::int as n from public.orders where auction_item_id=$1',[lot.id]))[0].n,1)
    assert.deepEqual((await rows('select physical_quantity,reserved_quantity,available_quantity from public.inventory where artwork_id=$1',[lot.artwork_id]))[0],{physical_quantity:0,reserved_quantity:0,available_quantity:0})
    for(const untouched of lots.slice(1))assert.deepEqual((await rows('select physical_quantity,reserved_quantity,available_quantity from public.inventory where artwork_id=$1',[untouched.artwork_id]))[0],{physical_quantity:1,reserved_quantity:0,available_quantity:1})
  }))
  for(const change of ['stock','suspension','image','moderation','engagement'])test(`Module 06: ${change} changes invalidate approved selection without partial scheduling`,()=>fixture(async f=>{
    const id=await f.generate();await f.review(id,'APPROVE')
    const [candidate]=await rows('select artwork_id,seller_id from private.auction_selection_candidates where run_id=$1 and selected_position=1',[id])
    if(change==='stock')await db.query('update public.inventory set reserved_quantity=1 where artwork_id=$1',[candidate.artwork_id])
    if(change==='suspension')await db.query("update public.profiles set status='SUSPENDED' where id=$1",[candidate.seller_id])
    if(change==='image')await db.query('delete from storage.objects where name in(select object_path from public.artwork_images where artwork_id=$1)',[candidate.artwork_id])
    if(change==='moderation')await db.query("update public.artworks set status='SUSPENDED' where id=$1",[candidate.artwork_id])
    if(change==='engagement')await db.query('insert into public.likes(user_id,artwork_id) values($1,$2)',[other,candidate.artwork_id])
    const before=(await rows('select count(*)::int as n from public.auctions'))[0].n
    await f.rejected(admin,'select public.schedule_weekly_selection($1)',[id],'22023')
    assert.equal((await rows('select count(*)::int as n from public.auctions'))[0].n,before)
    assert.ok((await f.dashboard(id)).candidates.some(c=>c.stale))
    await f.review(id,'REJECT')
    assert.notEqual(await f.generate(true),id)
  }))
  test('Module 06: bounded candidate failures are visible and retry safely after configuration changes',()=>fixture(async f=>{
    await f.as(admin,()=>db.query("select public.configure_weekly_selection(false,'Asia/Kolkata',0,'18:00',24,5)"))
    const id=await f.generate()
    const [failed]=await rows('select * from private.auction_selection_runs where id=$1',[id])
    assert.equal(failed.status,'FAILED');assert.equal(failed.failure_code,'CANDIDATE_LIMIT')
    assert.equal((await rows('select count(*)::int as n from private.auction_selection_candidates where run_id=$1',[id]))[0].n,0)
    await f.as(admin,()=>db.query("select public.configure_weekly_selection(false,'Asia/Kolkata',0,'18:00',24,250)"))
    const next=await f.generate(true)
    assert.equal((await rows('select status from private.auction_selection_runs where id=$1',[next]))[0].status,'GENERATED')
  }))
  test('Module 06: existing draft deletion preserves scan history without blocking surviving recommendations',()=>fixture(async f=>{
    const draft=f.artworks[0]
    await db.query("update public.artworks set status='DRAFT' where id=$1",[draft.id])
    // A deletable draft has no media. Build that state in this isolated fixture;
    // actual media removal remains owned by the existing Storage workflow.
    await db.query('delete from public.artwork_images where artwork_id=$1',[draft.id])
    await db.query('delete from storage.objects where name=$1',[draft.path])
    const id=await f.generate()
    const [selected]=await rows('select * from private.auction_selection_candidates where run_id=$1 and source_artwork_id=$2',[id,draft.id])
    assert.equal(selected.selected_position,null)
    await f.as(draft.owner,()=>rows("select public.save_artwork($1,'DELETE','{}'::jsonb)",[draft.id]))
    const [historical]=await rows('select * from private.auction_selection_candidates where id=$1',[selected.id])
    assert.equal(historical.artwork_id,null)
    assert.equal(historical.source_artwork_id,draft.id)
    assert.deepEqual(historical.snapshot,selected.snapshot)
    const candidate=(await f.dashboard(id)).candidates.find(c=>c.id===selected.id)
    assert.equal(candidate.stale,true);assert.ok(candidate.currentReasons.includes('ARTWORK_MISSING'))
    const fresh=await f.generate(true)
    assert.equal((await f.dashboard(fresh)).runs.find(r=>r.id===fresh).selected_count,5)
    assert.equal((await rows('select count(*)::int as n from private.auction_selection_candidates where run_id=$1 and source_artwork_id=$2',[fresh,draft.id]))[0].n,0)
    await f.review(fresh,'APPROVE')
  }))
  test('Module 06: overlapping requests share one logical run and one scheduling gate',()=>fixture(async f=>{
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[admin])
    // PGlite serializes connections. These overlapping requests prove logical
    // idempotency, not live multi-backend lock contention (documented separately).
    const requests=await Promise.all([rows('select public.generate_weekly_selection($1) as id',[f.starts]),rows('select public.generate_weekly_selection($1) as id',[f.starts])])
    assert.equal(requests[0][0].id,requests[1][0].id)
    assert.equal((await rows('select count(*)::int as n from private.auction_selection_runs'))[0].n,1)
    for(const fn of ["public.schedule_weekly_selection(uuid)","public.schedule_auction_lot(uuid,timestamptz,timestamptz,bigint,bigint,integer)"]){
      const [body]=await rows('select pg_get_functiondef($1::regprocedure) as sql',[fn])
      assert.ok(body.sql.includes('artvault-auction-scheduling'))
    }
  }))
  test('Module 06: generation failures roll back partial writes and cron retries stop after three attempts',()=>fixture(async f=>{
    const target=new Date(f.starts);target.setMilliseconds(0)
    const [calendar]=await rows("select extract(dow from $1::timestamptz at time zone 'Asia/Kolkata')::int as day,to_char($1::timestamptz at time zone 'Asia/Kolkata','HH24:MI:SS') as time",[target.toISOString()])
    await f.as(admin,()=>db.query("select public.configure_weekly_selection(true,'Asia/Kolkata',$1,$2::time)",[calendar.day,calendar.time]))
    await db.exec("create function pg_temp.fail_selection_fixture() returns trigger language plpgsql as $$ begin raise exception 'Isolated database failure'; end $$; create trigger isolated_analysis_failure before insert on public.artwork_analyses for each row execute function pg_temp.fail_selection_fixture();")
    await db.query("select set_config('request.jwt.claim.sub','',true)")
    const due=new Date(target.getTime()-3*86400000).toISOString()
    for(const expected of [1,1,1,0])assert.equal((await rows('select private.prepare_weekly_selections($1) as n',[due]))[0].n,expected)
    const runs=await rows('select * from private.auction_selection_runs order by generation')
    assert.equal(runs.length,3)
    assert.equal(runs[2].status,'FAILED');assert.equal(runs[2].failure_code,'GENERATION_FAILED')
    assert.equal(runs[2].requested_by,null)
    assert.equal((await rows('select count(*)::int as n from private.auction_selection_candidates'))[0].n,0)
    assert.equal((await rows('select count(*)::int as n from public.artwork_analyses'))[0].n,0)
  }))
  test('Module 06: existing model findings are not overwritten by metadata fallback',()=>fixture(async f=>{
    const a=f.artworks[0]
    await db.query("insert into public.artwork_analyses(artwork_id,source_sha256,provider,model,description,analysis_method) values($1,repeat('d',64),'ISOLATED_TEST_FIXTURE','test-only','Previously stored supported findings','VISION')",[a.id])
    const run=await f.generate()
    const [analysis]=await rows('select * from public.artwork_analyses where artwork_id=$1',[a.id])
    assert.equal(analysis.description,'Previously stored supported findings')
    assert.equal(analysis.provider,'ISOLATED_TEST_FIXTURE')
    assert.equal(analysis.analysis_method,'VISION')
    assert.equal((await f.dashboard(run)).candidates.find(c=>c.artwork_id===a.id).snapshot.analysisEvidence.provider,'ISOLATED_TEST_FIXTURE')
  }))
  test('Module 06: three-day preparation honors Kolkata/DST and cron retries do not duplicate runs',()=>fixture(async f=>{
    const [times]=await rows("select private.selection_prepare_at('2027-03-15 18:00 Asia/Kolkata','Asia/Kolkata') as india,private.selection_prepare_at('2027-03-15 18:00 America/New_York','America/New_York') as dst")
    assert.equal(new Date(times.india).toISOString(),'2027-03-12T12:30:00.000Z')
    assert.equal(new Date(times.dst).toISOString(),'2027-03-12T23:00:00.000Z') // DST begins March 14, 2027.
    const [calendar]=await rows("select extract(dow from $1::timestamptz at time zone 'Asia/Kolkata')::int as day,to_char($1::timestamptz at time zone 'Asia/Kolkata','HH24:MI:SS') as time",[f.starts])
    await f.as(admin,()=>db.query("select public.configure_weekly_selection(true,'Asia/Kolkata',$1,$2::time)",[calendar.day,calendar.time]))
    // Config uses whole seconds; compare against a canonical local weekly start.
    const target=new Date(f.starts);target.setMilliseconds(0)
    const early=new Date(target.getTime()-3*86400000-1000).toISOString()
    assert.equal((await rows('select private.prepare_weekly_selections($1) as n',[early]))[0].n,0)
    const due=new Date(target.getTime()-3*86400000).toISOString()
    assert.equal((await rows('select private.prepare_weekly_selections($1) as n',[due]))[0].n,1)
    assert.equal((await rows('select private.prepare_weekly_selections($1) as n',[due]))[0].n,0)
    assert.equal((await rows('select count(*)::int as n from private.auction_selection_windows'))[0].n,1)
    assert.equal((await rows('select count(*)::int as n from private.auction_selection_runs'))[0].n,1)
  }))
}
