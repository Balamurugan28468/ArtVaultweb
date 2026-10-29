import { useState } from 'react'
import { PublicArtworkCard } from '@/features/artwork'
import { useArtistDisplayNames } from '@/features/marketplace'
import { useRecommendations } from '@/features/recommendations'
import type { RecommendationMode } from '@/features/recommendations/api/recommendationRepository'
import { Button,Container,EmptyState,ErrorState,PageHeader,ResponsiveGrid,Skeleton } from '@/shared/ui'

const tabs:{id:RecommendationMode;label:string}[]=[{id:'for-you',label:'For You'},{id:'related',label:'Similar Artworks'},{id:'trending',label:'Trending Now'},{id:'following',label:'Artists You Follow'},{id:'liked',label:'Based on Your Likes'},{id:'new',label:'New Discoveries'}]
export function RecommendationsPage(){
  const [mode,setMode]=useState<RecommendationMode>('for-you')
  const feed=useRecommendations(mode)
  const names=useArtistDisplayNames(feed.artworks.map(a=>a.sellerId))
  return <Container size="wide"><section className="flex flex-col gap-6">
    <PageHeader title="Recommended for You" description="Discover artworks based on your interests and activity."/>
    <p className="text-sm text-text-secondary">Heuristic recommendations — no visual AI or deep-learning personalization. {feed.personalized?'Using your own interests.':'Discovering eligible artworks using public signals.'}</p>
    <div role="tablist" aria-label="Recommendation source" className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map((tab,i)=><button key={tab.id} id={`recommendation-tab-${tab.id}`} type="button" role="tab" aria-selected={mode===tab.id} aria-controls="recommendation-results" tabIndex={mode===tab.id?0:-1}
        onKeyDown={e=>{const direction=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(direction){e.preventDefault();const next=tabs[(i+direction+tabs.length)%tabs.length];setMode(next.id);document.getElementById(`recommendation-tab-${next.id}`)?.focus()}}}
        onClick={()=>setMode(tab.id)} className={`shrink-0 rounded-full border px-3.5 py-2 text-sm ${mode===tab.id?'border-accent-gold bg-accent-gold/10 text-accent-gold':'border-border-strong text-text-secondary'}`}>{tab.label}</button>)}
    </div>
    <div id="recommendation-results" role="tabpanel" aria-labelledby={`recommendation-tab-${mode}`}>
      {feed.status==='pending'&&<div aria-busy="true" aria-label="Loading recommendations" className="grid grid-cols-2 gap-4"><Skeleton className="h-64"/><Skeleton className="h-64"/></div>}
      {feed.status==='error'&&<><ErrorState title="Couldn't load recommendations" description="Check your connection and try again."/><Button onClick={()=>void feed.refetch()}>Retry recommendations</Button></>}
      {feed.status==='success'&&!feed.items.length&&<EmptyState title="Nothing to recommend yet" description="No eligible artworks are available in this result. Try New Discoveries or refresh later."/>}
      {feed.items.length>0&&<ResponsiveGrid>{feed.items.map(item=><div key={item.artwork.id} className="min-w-0"><PublicArtworkCard artwork={item.artwork} artistDisplayName={names[item.artwork.sellerId]}/><p className="mt-2 text-xs text-text-secondary">{item.reason}</p></div>)}</ResponsiveGrid>}
      {feed.hasNextPage&&<Button className="mt-5" disabled={feed.isFetchingNextPage} onClick={()=>void feed.fetchNextPage()}>{feed.isFetchingNextPage?'Loading…':'Load more recommendations'}</Button>}
    </div>
  </section></Container>
}