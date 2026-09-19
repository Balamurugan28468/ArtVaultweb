import { createClient } from '@/lib/supabase/client'
import { dataError, observe, result, rpc, signedImage, requireIdentity } from '@/lib/supabase/data'
import { Timestamp, timestamp } from '@/lib/supabase/timestamp'
import { isArtworkStatus, isArtworkCategory, isArtworkImageContentType, type Artwork, type ArtworkImage, type ArtworkDraftInput, type ArtworkError } from '../types'
export const toArtworkError=dataError
export function mapToArtwork(id:string,data:Record<string,unknown>):Artwork|null {
 if(typeof data.sellerId!=='string'||!isArtworkStatus(data.status))return null
 const images:ArtworkImage[]=Array.isArray(data.images)?data.images.filter((v):v is ArtworkImage=>typeof v==='object'&&v!==null&&typeof v.id==='string'&&typeof v.path==='string'&&typeof v.url==='string'&&isArtworkImageContentType(v.contentType)&&typeof v.size==='number'&&typeof v.order==='number'):[]
 return {id,sellerId:data.sellerId,title:typeof data.title==='string'?data.title:'',description:typeof data.description==='string'?data.description:'',
  price:typeof data.price==='number'?data.price:0,category:isArtworkCategory(data.category)?data.category:'other',
  tags:Array.isArray(data.tags)?data.tags.filter((t):t is string=>typeof t==='string'):[],images,
  inventoryCount:typeof data.inventoryCount==='number'?data.inventoryCount:0,reservedCount:typeof data.reservedCount==='number'?data.reservedCount:0,
  status:data.status,reviewedAt:data.reviewedAt instanceof Timestamp?data.reviewedAt:null,
  rejectionReason:typeof data.rejectionReason==='string'?data.rejectionReason:null,likeCount:typeof data.likeCount==='number'?data.likeCount:0,
  createdAt:data.createdAt instanceof Timestamp?data.createdAt:Timestamp.now(),updatedAt:data.updatedAt instanceof Timestamp?data.updatedAt:Timestamp.now()}
}
export async function mapCatalogRow(row:Record<string,unknown>):Promise<Artwork> {
 const images=await Promise.all((Array.isArray(row.images)?row.images:[]).map(async(image:Record<string,unknown>)=>({...image,url:await signedImage(String(image.path))})))
 const mapped=mapToArtwork(String(row.id),{...row,sellerId:row.seller_id,price:Number(row.price_minor),inventoryCount:row.physical_quantity,reservedCount:row.reserved_quantity,likeCount:Number(row.like_count),images,
  reviewedAt:row.reviewed_at?timestamp(row.reviewed_at):null,rejectionReason:row.rejection_reason,createdAt:timestamp(row.created_at),updatedAt:timestamp(row.updated_at)})
 if(!mapped)throw dataError(null)
 return mapped
}
export async function sellerArtworks(sellerId:string,published=false):Promise<Artwork[]> {
 let query=createClient().from('artwork_catalog').select('*').eq('seller_id',sellerId).order('updated_at',{ascending:false})
 if(published)query=query.eq('status','PUBLISHED')
 return Promise.all((await result(query)).map(mapCatalogRow))
}
export function subscribeSellerArtworks(sellerId:string,onData:(a:Artwork[])=>void,onError:(e:ArtworkError)=>void) {
 return observe('artworks','seller_id=eq.'+sellerId,()=>sellerArtworks(sellerId),onData,onError)
}
export function subscribePublishedArtworks(sellerId:string,onData:(a:Artwork[])=>void,onError:(e:ArtworkError)=>void) {
 return observe('artworks','seller_id=eq.'+sellerId,()=>sellerArtworks(sellerId,true),onData,onError)
}
export async function getArtwork(id:string):Promise<Artwork|null> {
 const row=await result(createClient().from('artwork_catalog').select('*').eq('id',id).maybeSingle())
 return row?mapCatalogRow(row):null
}
export async function getPublicArtwork(id:string):Promise<Artwork|null> {
 const row=await result(createClient().from('artwork_catalog').select('*').eq('id',id).eq('status','PUBLISHED').maybeSingle())
 return row?mapCatalogRow(row):null
}
export function subscribeArtwork(id:string,onData:(a:Artwork|null)=>void,onError:(e:ArtworkError)=>void) {
 const read=()=>getArtwork(id)
 const stop=observe('artworks','id=eq.'+id,read,onData,onError)
 const stopStock=observe('inventory','artwork_id=eq.'+id,read,onData,onError)
 return ()=>{stop();stopStock()}
}
export async function createArtworkDraft(sellerId:string,input:ArtworkDraftInput):Promise<string> {
 await requireIdentity(sellerId)
 return rpc<string>('save_artwork',{target:null,operation:'CREATE',fields:input})
}
export async function updateArtworkDraft(id:string,input:ArtworkDraftInput):Promise<void> {await rpc('save_artwork',{target:id,operation:'EDIT',fields:input})}
export async function submitArtwork(id:string):Promise<void> {await rpc('save_artwork',{target:id,operation:'SUBMIT'})}
export interface ArtworkSafeFieldsInput {price:number;inventoryCount:number;tags:string[]}
export async function updatePublishedArtworkSafeFields(id:string,input:ArtworkSafeFieldsInput):Promise<void> {await rpc('save_artwork',{target:id,operation:'SAFE_EDIT',fields:input})}
export async function resubmitArtworkForReview(id:string,input:ArtworkDraftInput,images:ArtworkImage[]):Promise<void> {await rpc('resubmit_artwork',{target:id,fields:input,images:images.map(i=>({id:i.id}))})}
export async function deleteOwnedArtwork(id:string):Promise<void> {await rpc('save_artwork',{target:id,operation:'DELETE'})}
export async function removeArtworkFromSale(id:string):Promise<void> {await rpc('save_artwork',{target:id,operation:'REMOVE'})}
export async function mutateArtworkImages(id:string,updater:(images:ArtworkImage[])=>ArtworkImage[]):Promise<ArtworkImage[]> {
 const current=await getArtwork(id)
 if(!current)throw dataError(null)
 const next=updater(current.images)
 await rpc('update_artwork_images',{target:id,images:next.map(i=>({id:i.id}))})
 return next
}
