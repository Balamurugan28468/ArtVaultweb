import { useRecommendations } from './useRecommendations'
export function useTrendingArtworks(){
  const query=useRecommendations('trending')
  return {...query,data:query.artworks}
}