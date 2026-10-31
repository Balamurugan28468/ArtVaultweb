import type { ArtworkCategory } from '@/features/artwork'
import { useRecommendations } from '@/features/recommendations/hooks/useRecommendations'

/** Public, eligible related discoveries; no fabricated visual claims. */
export function useRelatedArtworks(category:ArtworkCategory|undefined,excludeId:string|undefined){
  const feed=useRecommendations('related',excludeId,!!category)
  return {status:feed.status,artworks:feed.artworks.filter(a=>a.id!==excludeId).slice(0,4)}
}