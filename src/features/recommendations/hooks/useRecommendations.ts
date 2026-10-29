import { useEffect } from 'react'
import { useInfiniteQuery,useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/providers/AuthProvider'
import { useWishlist } from '@/features/wishlist/context/WishlistProvider'
import { getRecommendationPage,type RecommendationCursor,type RecommendationMode } from '../api/recommendationRepository'

export function useRecommendations(mode:RecommendationMode='for-you',anchorId?:string,enabled=true){
  const auth=useAuth()
  const wishlist=useWishlist()
  const viewer=auth.status==='authenticated'?auth.user?.uid??null:null
  const guestAnchor=!viewer&&['for-you','related'].includes(mode)?[...wishlist.savedIds].sort().find(id=>/^[0-9a-f-]{36}$/i.test(id)):undefined
  const anchor=anchorId??guestAnchor
  const client=useQueryClient()
  useEffect(()=>()=>{void client.cancelQueries({queryKey:['recommendations-v2',viewer]});client.removeQueries({queryKey:['recommendations-v2',viewer]})},[client,viewer])
  const query=useInfiniteQuery({
    queryKey:['recommendations-v2',viewer,mode,anchor??null],
    initialPageParam:undefined as RecommendationCursor|undefined,
    queryFn:({pageParam})=>getRecommendationPage(mode,anchor,pageParam),
    getNextPageParam:page=>page.nextCursor,
    enabled:enabled&&auth.status!=='loading'&&(!['for-you','related','liked'].includes(mode)||wishlist.status!=='loading'),
    staleTime:30_000,
  })
  const seen=new Set<string>()
  const items=(query.data?.pages.flatMap(page=>page.items)??[]).filter(item=>{
    if(seen.has(item.artwork.id)||(['for-you','related','liked'].includes(mode)&&wishlist.savedIds.has(item.artwork.id)))return false
    seen.add(item.artwork.id);return true
  })
  return {...query,items,artworks:items.map(item=>item.artwork),personalized:query.data?.pages.some(page=>page.personalized)??false}
}
