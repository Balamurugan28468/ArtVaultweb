import { z } from 'zod'
import { rpc,signedImage } from '@/lib/supabase/data'

const windowSchema=z.object({starts_at:z.string(),ends_at:z.string(),timezone:z.string(),auction_id:z.string().nullable()})
const runSchema=z.object({id:z.string(),status:z.enum(['GENERATED','APPROVED','REJECTED','SUPERSEDED','SCHEDULED','FAILED']),
  generation:z.number(),eligible_count:z.number(),selected_count:z.number(),captured_at:z.string(),failure_code:z.string().nullable(),
  analysis_method:z.literal('HEURISTIC'),window:windowSchema})
const candidateSchema=z.object({id:z.string(),artwork_id:z.string().nullable(),eligible:z.boolean(),reasons:z.array(z.string()),
  rank:z.number().nullable(),selected_position:z.number().nullable(),score:z.coerce.number().min(0).max(100),
  explanation:z.string(),components:z.record(z.string(),z.coerce.number()),stale:z.boolean(),currentReasons:z.array(z.string()),
  snapshot:z.object({title:z.string(),artist:z.string().nullable(),category:z.string(),available:z.number(),imagePath:z.string().nullable(),
    analysisEvidence:z.object({provider:z.string(),model:z.string(),summary:z.string().nullable(),method:z.literal('VISION')}).nullish()})})
const responseSchema=z.object({config:z.object({enabled:z.boolean(),timezone:z.string(),weekday:z.number(),local_start:z.string(),
  duration_hours:z.number(),candidate_limit:z.number()}),runs:z.array(runSchema),candidates:z.array(candidateSchema)})
export type SelectionRun=z.infer<typeof runSchema>
export type SelectionCandidate=z.infer<typeof candidateSchema>&{thumbnail?:string}
export type SelectionDashboard=Omit<z.infer<typeof responseSchema>,'candidates'>&{candidates:SelectionCandidate[]}

export async function getSelectionDashboard(runId?:string):Promise<SelectionDashboard>{
  const data=responseSchema.parse(await rpc('get_weekly_selections',{p_run_id:runId??null}))
  const candidates:SelectionCandidate[]=[]
  for(const candidate of data.candidates){
    let thumbnail:string|undefined
    if(candidate.artwork_id && candidate.selected_position && candidate.snapshot.imagePath){
      try{thumbnail=await signedImage(candidate.snapshot.imagePath)}catch{ /* A missing image never bypasses eligibility. */ }
    }
    candidates.push({...candidate,thumbnail})
  }
  return {...data,candidates}
}
export const generateSelection=(startsAt:string,regenerate=false)=>rpc<string>('generate_weekly_selection',{p_starts_at:startsAt,p_regenerate:regenerate})
export const reviewSelection=(runId:string,action:'APPROVE'|'REJECT'|'REGENERATE'|'REFRESH',reason:string)=>
  rpc<string>('review_weekly_selection',{p_run_id:runId,p_action:action,p_reason:reason})
export const scheduleSelection=(runId:string)=>rpc<string>('schedule_weekly_selection',{p_run_id:runId})
export const configureSelection=(config:SelectionDashboard['config'])=>rpc('configure_weekly_selection',{
  p_enabled:config.enabled,p_timezone:config.timezone,p_weekday:config.weekday,p_local_start:config.local_start,
  p_duration_hours:config.duration_hours,p_candidate_limit:config.candidate_limit})
