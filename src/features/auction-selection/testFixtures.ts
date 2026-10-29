import type { SelectionDashboard } from './api/selectionRepository'
export function selectionFixture():SelectionDashboard{
  return {config:{enabled:false,timezone:'Asia/Kolkata',weekday:0,local_start:'18:00:00',duration_hours:24,candidate_limit:250},
    runs:[{id:'run-1',status:'GENERATED',generation:1,eligible_count:1,selected_count:1,captured_at:'2026-10-23T10:00:00Z',failure_code:null,
      analysis_method:'HEURISTIC',window:{starts_at:'2026-10-28T12:30:00Z',ends_at:'2026-10-29T12:30:00Z',timezone:'Asia/Kolkata',auction_id:null}}],
    candidates:[{id:'candidate-1',artwork_id:'art-1',eligible:true,reasons:[],rank:1,selected_position:1,score:75,
      explanation:'Heuristic ranking. No visual model executed.',components:{listing:35,engagement:0,freshness:20,exposureFairness:15,inventory:5,total:75},
      stale:false,currentReasons:[],snapshot:{title:'Original Painting',artist:'Artist One',category:'Painting',available:1,imagePath:'seller/art/front.png'}}]}
}
