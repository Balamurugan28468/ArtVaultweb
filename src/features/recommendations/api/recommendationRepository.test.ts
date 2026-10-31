import { beforeEach,describe,expect,it,vi } from 'vitest'
const mocks=vi.hoisted(()=>({rpc:vi.fn(),map:vi.fn()}))
vi.mock('@/lib/supabase/data',()=>({rpc:mocks.rpc}))
vi.mock('@/features/artwork/api/artworkRepository',()=>({mapCatalogRow:mocks.map}))
import { getRecommendationPage } from './recommendationRepository'
const date='2026-10-23T12:00:00Z'
const page={method:'HEURISTIC',asOf:date,personalized:true,nextOffset:12,items:[{score:52,reason:'Based on your wishlist',artwork:{id:'a'}}]}
beforeEach(()=>{vi.clearAllMocks();mocks.rpc.mockResolvedValue(page);mocks.map.mockResolvedValue({id:'a',status:'PUBLISHED',inventoryCount:1,reservedCount:0,images:[{url:'signed'}]})})
describe('Recommendation API boundary',()=>{
 it('uses the server feed with bounded pages and never sends a browser user ID',async()=>{const result=await getRecommendationPage('for-you');expect(mocks.rpc).toHaveBeenCalledWith('get_artwork_recommendations',{p_mode:'for-you',p_anchor_id:null,p_offset:0,p_limit:12,p_as_of:null});expect(result.items[0]).toMatchObject({reason:'Based on your wishlist',score:52});expect(result.nextCursor).toEqual({offset:12,asOf:date})})
 it('reuses a snapshot cursor and explicit related anchor',async()=>{await getRecommendationPage('related','art',{offset:12,asOf:date});expect(mocks.rpc).toHaveBeenCalledWith('get_artwork_recommendations',expect.objectContaining({p_anchor_id:'art',p_offset:12,p_as_of:date}))})
 it.each([{status:'DRAFT',inventoryCount:1,images:[{}]},{status:'PUBLISHED',inventoryCount:1,reservedCount:1,images:[{}]},{status:'PUBLISHED',inventoryCount:1,images:[]}])('does not render ineligible mapped assets: %j',async artwork=>{mocks.map.mockResolvedValue(artwork);expect((await getRecommendationPage('new')).items).toEqual([])})
 it('skips signing or mapping failures rather than inventing thumbnails',async()=>{mocks.map.mockRejectedValue(new Error('private asset unavailable'));expect((await getRecommendationPage('trending')).items).toEqual([])})
 it.each([{...page,method:'DEEP_LEARNING'},{...page,items:[{...page.items[0],score:101}]},{...page,nextOffset:999}])('rejects invalid response contracts',async response=>{mocks.rpc.mockResolvedValue(response);await expect(getRecommendationPage('new')).rejects.toThrow()})
 it('propagates offline errors for the retry UI',async()=>{mocks.rpc.mockRejectedValue(new Error('offline'));await expect(getRecommendationPage('new')).rejects.toThrow('offline')})
})
