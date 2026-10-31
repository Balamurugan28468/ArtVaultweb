import { useRecommendations } from './useRecommendations'

/** Compatibility exports backed by the one authorized recommendation feed. */
export function useForYouArtworks(){
  const query=useRecommendations('for-you')
  return {...query,status:query.status==='pending'?'loading' as const:query.status}
}
export type ForYouResult=ReturnType<typeof useForYouArtworks>
export function useSimilarArtworks(){
  const query=useRecommendations('related')
  return {...query,status:query.status==='pending'?'loading' as const:query.status,anchorCategory:null}
}