import { createClient } from '@/lib/supabase/client'
import { dataError, result, rpc } from '@/lib/supabase/data'
export const toLikeError=dataError
export async function hasLiked(artworkId:string,uid:string):Promise<boolean> {
 return !!await result(createClient().from('likes').select('id').eq('artwork_id',artworkId).eq('user_id',uid).maybeSingle())
}
export async function likeArtwork(artworkId:string,uid:string):Promise<void> {
 const {error}=await createClient().from('likes').insert({artwork_id:artworkId,user_id:uid})
 if(error&&error.code!=='23505')throw dataError(error)
}
export async function unlikeArtwork(artworkId:string,uid:string):Promise<void> {
 await result(createClient().from('likes').delete().eq('artwork_id',artworkId).eq('user_id',uid))
}
export interface AuthoritativeLikeState {liked:boolean;likeCount:number}
export async function getAuthoritativeLikeState(artworkId:string,uid:string):Promise<AuthoritativeLikeState> {
 const [liked,likeCount]=await Promise.all([hasLiked(artworkId,uid),rpc<number>('artwork_like_count',{target:artworkId})])
 return {liked,likeCount}
}
