import { createClient } from '@/lib/supabase/client'
import { result } from '@/lib/supabase/data'
import { ARTWORK_CATEGORIES, type Artwork, type ArtworkCategory } from '@/features/artwork'
import { mapCatalogRow } from '@/features/artwork/api/artworkRepository'
import type { MarketplaceCursor, MarketplaceFilters, MarketplacePage } from '../types'
export const MARKETPLACE_PAGE_SIZE=12
export async function fetchMarketplacePage(filters:MarketplaceFilters,cursor:MarketplaceCursor|null):Promise<MarketplacePage> {
 const sort=(filters.minPrice!==null||filters.maxPrice!==null)&&filters.sort==='newest'?'price-asc':filters.sort
 const field=sort==='newest'?'created_at':'price_minor',ascending=sort==='price-asc',op=ascending?'gt':'lt'
 let q=createClient().from('artwork_catalog').select('*').eq('status','PUBLISHED')
 if(filters.category)q=q.eq('category',filters.category)
 if(filters.minPrice!==null)q=q.gte('price_minor',filters.minPrice)
 if(filters.maxPrice!==null)q=q.lte('price_minor',filters.maxPrice)
 if(cursor){
  if(!/^[0-9a-f-]{36}$/i.test(cursor.id))throw new Error('Invalid marketplace cursor')
  const value=typeof cursor.primary==='number'?cursor.primary:cursor.primary.toDate().toISOString()
  q=q.or(field+'.'+op+'.'+value+',and('+field+'.eq.'+value+',id.'+op+'.'+cursor.id+')')
 }
 const rows=await result(q.order(field,{ascending}).order('id',{ascending}).limit(MARKETPLACE_PAGE_SIZE))
 const artworks=await Promise.all(rows.map(mapCatalogRow)),last=artworks.at(-1)
 return {artworks,nextCursor:rows.length===MARKETPLACE_PAGE_SIZE&&last?{primary:sort==='newest'?last.createdAt:last.price,id:last.id}:null}
}
export async function fetchTrendingArtworks():Promise<Artwork[]> {
 return Promise.all((await result(createClient().from('artwork_catalog').select('*').eq('status','PUBLISHED').order('like_count',{ascending:false}).order('id').limit(12))).map(mapCatalogRow))
}
export async function fetchCategoryArtworkCounts():Promise<{total:number;byCategory:Record<ArtworkCategory,number>}> {
 const counts=await Promise.all(ARTWORK_CATEGORIES.map(async category=>{
  const {count,error}=await createClient().from('artwork_catalog').select('id',{head:true,count:'exact'}).eq('status','PUBLISHED').eq('category',category)
  if(error)throw error
  return [category,count??0] as const
 }))
 return {total:counts.reduce((n,[,count])=>n+count,0),byCategory:Object.fromEntries(counts) as Record<ArtworkCategory,number>}
}
