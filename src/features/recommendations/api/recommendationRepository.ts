import { z } from 'zod'
import { mapCatalogRow } from '@/features/artwork/api/artworkRepository'
import { rpc } from '@/lib/supabase/data'
import type { Artwork } from '@/features/artwork'

export type RecommendationMode='for-you'|'related'|'trending'|'following'|'liked'|'new'
export interface RecommendationCursor { offset:number;asOf:string }
export interface RecommendationItem { artwork:Artwork;reason:string;score:number }
const responseSchema=z.object({method:z.literal('HEURISTIC'),asOf:z.string().datetime({offset:true}),personalized:z.boolean(),
  nextOffset:z.number().int().min(0).max(499).nullable(),items:z.array(z.object({score:z.coerce.number().min(0).max(100),reason:z.string().min(1).max(120),artwork:z.record(z.string(),z.unknown())})).max(20)})
export async function getRecommendationPage(mode:RecommendationMode,anchorId?:string,cursor?:RecommendationCursor){
  const data=responseSchema.parse(await rpc('get_artwork_recommendations',{p_mode:mode,p_anchor_id:anchorId??null,p_offset:cursor?.offset??0,p_limit:12,p_as_of:cursor?.asOf??null}))
  const items:RecommendationItem[]=[]
  for(const candidate of data.items){
    try{
      const artwork=await mapCatalogRow(candidate.artwork)
      if(artwork.status==='PUBLISHED'&&artwork.inventoryCount-(artwork.reservedCount??0)>0&&artwork.images.length>0)items.push({artwork,reason:candidate.reason,score:candidate.score})
    }catch{ /* Broken private assets are not rendered as eligible recommendation cards. */ }
  }
  return {items,personalized:data.personalized,nextCursor:data.nextOffset===null?undefined:{offset:data.nextOffset,asOf:data.asOf}}
}
