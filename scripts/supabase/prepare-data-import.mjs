// Produce a reviewable atomic SQL import. No hosted writes here, no credential output.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {decodeSource} from './decode-source.mjs'
const root=fileURLToPath(new URL('../../',import.meta.url)), temp=path.join(root,'supabase/.temp')
const plan=JSON.parse(readFileSync(path.join(temp,'source-inspection.json'),'utf8'))
const {documents,generation}=decodeSource()
const legacy='ppqIaap00MbYNY9RGDQmTwBb54bP', seller='0d649039-ec68-4d12-8b79-8000241febdc'
const uuid=value=>{const h=createHash('sha256').update('artvault:firebase:'+value).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`}
const quote=value=>value===null||value===undefined?'null':typeof value==='number'?(Number.isSafeInteger(value)?String(value):(()=>{throw Error('Invalid numeric value')})()):typeof value==='boolean'?String(value):"'"+String(value).replaceAll("'","''")+"'"
const date=value=>value?.$timestamp??null
const record=p=>{const d=documents.find(d=>d.path===p);if(!d)throw Error('Missing approved source record');return d.data}
const approved=new Set(plan.artworks.map(a=>a.legacyId))
if(approved.size!==12)throw Error('Expected approved twelve-artwork source')
const rows=[],mappings=[],images=[]
function add(table,row,sourcePath){rows.push({table,row});if(sourcePath)mappings.push({source_path:sourcePath,target_table:table,target_id:row.id,source_sha256:generation})}
const p=record('users/'+legacy)
if(p.email!=='bm440946@gmail.com'||p.role!=='SELLER')throw Error('Source seller identity mismatch')
add('public.profiles',{id:seller,display_name:p.displayName,phone:p.phoneNumber,bio:p.bio,profile_completed:p.profileCompleted,created_at:date(p.createdAt),updated_at:date(p.updatedAt)},'users/'+legacy)
const s=record('sellers/'+legacy)
if(s.status!=='APPROVED')throw Error('Unexpected seller lifecycle')
add('public.seller_profiles',{id:seller,business_name:s.businessName,description:s.description,contact_email:s.contactEmail,status:s.status,reviewed_by:null,reviewed_at:date(s.reviewedAt),legacy_review_source_sha256:generation,created_at:date(s.createdAt),updated_at:date(s.updatedAt)},'sellers/'+legacy)
const artist=record('artists/'+legacy)
add('public.artist_profiles',{id:seller,display_name:artist.displayName,bio:artist.bio,created_at:date(artist.createdAt),updated_at:date(artist.updatedAt)},'artists/'+legacy)
for(const slug of ['painting','sculpture','photography','digital','other'])add('public.categories',{id:uuid('categories/'+slug),slug,name:slug[0].toUpperCase()+slug.slice(1)})
const metadata=JSON.parse(readFileSync(path.join(plan.source.path,'firebase-export-metadata.json'),'utf8'))
const metadataDir=path.join(plan.source.path,metadata.storage.path,'metadata')
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)])
const storage=walk(metadataDir).map(file=>({file,data:JSON.parse(readFileSync(file,'utf8'))}))
for(const oldId of [...approved].sort()) {
 const a=record('artworks/'+oldId), id=uuid('artworks/'+oldId)
 if(a.sellerId!==legacy||!['PUBLISHED','SUBMITTED'].includes(a.status))throw Error('Unapproved ownership or lifecycle')
 add('public.artworks',{id,seller_id:seller,category_id:uuid('categories/'+a.category),title:a.title,description:a.description,price_minor:a.price,currency:'INR',status:a.status,reviewed_at:date(a.reviewedAt),rejection_reason:a.rejectionReason??null,created_at:date(a.createdAt),updated_at:date(a.updatedAt)},'artworks/'+oldId)
 add('public.inventory',{id:uuid('inventory/'+oldId),artwork_id:id,physical_quantity:a.inventoryCount,reserved_quantity:a.reservedCount??0})
 for(const tag of a.tags??[])add('public.artwork_tags',{id:uuid('tags/'+oldId+'/'+tag),artwork_id:id,tag})
 for(const image of a.images??[]) {
  const stored=storage.find(o=>o.data.name===image.path)
  if(!stored||stored.data.contentType!==image.contentType||Number(stored.data.size)!==image.size)throw Error('Missing/mismatched image')
  const blob=path.join(plan.source.path,metadata.storage.path,'blobs',path.basename(stored.file,'.json'))
  const sha256=createHash('sha256').update(readFileSync(blob)).digest('hex'),imageId=uuid('images/'+image.path),objectPath=`${seller}/${id}/${imageId}`
  add('public.artwork_images',{id:imageId,artwork_id:id,object_path:objectPath,position:image.order,content_type:image.contentType,byte_size:image.size,source_sha256:sha256},'images/'+image.path)
  images.push({id:imageId,artworkId:id,sourcePath:image.path,blob,objectPath,sha256,contentType:image.contentType,size:image.size})
 }
}
const blockTag='$artvault_import_'+generation+'$'
if(JSON.stringify(rows).includes(blockTag))throw Error('Unsafe SQL block delimiter collision')
const sql=['begin;', 'set local standard_conforming_strings=on;',"select pg_advisory_xact_lock(714229319);",`do $$ begin if not exists(select 1 from auth.users u join private.user_roles r on r.id=u.id where u.id=${quote(seller)}::uuid and lower(u.email)='bm440946@gmail.com' and r.role='SELLER') then raise exception 'Seller mapping not verified'; end if; end $$;`]
// Any previous completed import is a no-op. Never overwrite subsequent seller edits.
sql.push(`do ${blockTag} begin if exists(select 1 from private.firebase_migration_records where source_path='users/${legacy}') then if not exists(select 1 from private.firebase_migration_records where source_path='users/${legacy}' and source_sha256=${quote(generation)} and target_id=${quote(seller)}::uuid) then raise exception 'Conflicting prior import'; end if; else`)
for(const {table,row} of rows){const keys=Object.keys(row);sql.push(`insert into ${table} (${keys.join(',')}) values (${keys.map(k=>quote(row[k])).join(',')})${table==='public.profiles'?` on conflict(id) do update set ${keys.filter(k=>k!=='id').map(k=>`${k}=excluded.${k}`).join(',')}`:''};`)}
for(const row of mappings){const keys=Object.keys(row);sql.push(`insert into private.firebase_migration_records(${keys.join(',')}) values(${keys.map(k=>quote(row[k])).join(',')});`)}
sql.push(`end if; end ${blockTag};`,'commit;')
writeFileSync(path.join(temp,'import-approved.sql'),sql.join('\n'))
writeFileSync(path.join(temp,'approved-assets.json'),JSON.stringify({generation,images},null,2))
console.log(JSON.stringify({preparedArtworks:approved.size,referencedImages:images.length,unreferencedStorageObjects:storage.length-images.length,sql:'supabase/.temp/import-approved.sql'}))
