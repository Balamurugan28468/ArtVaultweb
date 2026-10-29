import { useEffect,useState } from 'react'
import { Button,Card } from '@/shared/ui'
import { configureSelection,generateSelection,getSelectionDashboard,reviewSelection,scheduleSelection,
  type SelectionDashboard } from '../api/selectionRepository'

function message(error:unknown){return typeof error==='object'&&error!==null&&'message'in error?String(error.message):'Selection request failed. Retry safely.'}
export function WeeklySelectionReview({onScheduled}:{onScheduled?:()=>void}){
  const [data,setData]=useState<SelectionDashboard|null>(null)
  const [runId,setRunId]=useState<string>()
  const [starts,setStarts]=useState('')
  const [reason,setReason]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [refresh,setRefresh]=useState(0)
  useEffect(()=>{
    let active=true
    void getSelectionDashboard(runId).then(value=>{if(active){setData(value);setError('')}}).catch(e=>{if(active)setError(message(e))})
    return()=>{active=false}
  },[runId,refresh])
  const run=data?.runs.find(r=>r.id===(runId??data.runs[0]?.id))
  const selected=data?.candidates.filter(c=>c.selected_position!==null)??[]
  const stale=selected.some(c=>c.stale||c.currentReasons.length>0)
  async function act(action:()=>Promise<unknown>,success:string){
    if(busy)return
    setBusy(true);setError('');setNotice('')
    try{await action();setNotice(success);setRefresh(v=>v+1)}catch(e){setError(message(e))}finally{setBusy(false)}
  }
  return <Card className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
    <div><h2 className="font-display text-xl">Weekly artwork selection</h2>
      <p className="text-sm text-text-secondary">Heuristic ranking — no visual AI model executed. Up to five eligible works, reviewed before one weekly event is scheduled.</p></div>
    {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
    {notice&&<p role="status" className="text-sm text-accent-gold">{notice}</p>}
    {!data&&!error&&<p role="status">Loading selection history…</p>}
    {!data&&error&&<Button onClick={()=>setRefresh(v=>v+1)}>Retry selections</Button>}
    {data&&<>
      <details className="rounded border border-border p-3"><summary className="cursor-pointer">Automatic preparation schedule</summary>
        <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
          void act(()=>configureSelection({enabled:f.get('enabled')==='on',timezone:String(f.get('timezone')),weekday:Number(f.get('weekday')),
            local_start:String(f.get('time')),duration_hours:Number(f.get('duration')),candidate_limit:Number(f.get('limit'))}),'Preparation schedule saved. Approval remains manual.')}}>
          <label className="text-sm"><input type="checkbox" name="enabled" defaultChecked={data.config.enabled}/> Enable automatic preparation</label>
          <label className="text-sm">Timezone<input className="w-full rounded border border-border bg-surface p-2" name="timezone" defaultValue={data.config.timezone} required/></label>
          <label className="text-sm">Weekly day<select className="w-full rounded border border-border bg-surface p-2" name="weekday" defaultValue={data.config.weekday}>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day,i)=><option key={day} value={i}>{day}</option>)}</select></label>
          <label className="text-sm">Local auction start<input className="w-full rounded border border-border bg-surface p-2" type="time" name="time" defaultValue={data.config.local_start} required/></label>
          <label className="text-sm">Duration (hours)<input className="w-full rounded border border-border bg-surface p-2" type="number" name="duration" min="1" max="72" defaultValue={data.config.duration_hours} required/></label>
          <label className="text-sm">Candidate scan limit<input className="w-full rounded border border-border bg-surface p-2" type="number" name="limit" min="5" max="1000" defaultValue={data.config.candidate_limit} required/></label>
          <p className="text-xs sm:col-span-2">Prepares three local calendar days before start. Does not automatically approve or schedule an auction.</p>
          <Button type="submit" disabled={busy}>Save preparation schedule</Button>
        </form></details>
      <form className="flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();if(!starts)return;void act(async()=>{
        const id=await generateSelection(new Date(starts).toISOString());setRunId(id)
      },'Selection request recorded. Review the run status below.')}}>
        <label className="min-w-0 flex-1 text-sm">Auction start (your local time)<input type="datetime-local" required value={starts} onChange={e=>setStarts(e.target.value)} className="mt-1 w-full rounded border border-border bg-surface p-2"/></label>
        <Button type="submit" disabled={busy||!starts}>Generate selection</Button>
      </form>
      <label className="text-sm">Previous selection runs<select aria-label="Selection run" value={run?.id??''} onChange={e=>setRunId(e.target.value)} className="mt-1 w-full rounded border border-border bg-surface p-2">
        {!data.runs.length&&<option value="">No selection runs yet</option>}
        {data.runs.map(r=><option key={r.id} value={r.id}>{new Date(r.window.starts_at).toLocaleString(undefined,{timeZone:r.window.timezone})} · v{r.generation} · {r.status}</option>)}
      </select></label>
      {run&&<>
        <div className="text-sm"><p>{run.status} · {new Date(run.window.starts_at).toLocaleString(undefined,{timeZone:run.window.timezone})} ({run.window.timezone})</p>
          {run.status==='FAILED'?<p>Preparation incomplete; eligible totals have not been calculated.</p>:<p>{run.selected_count} selected from {run.eligible_count} eligible artworks. {run.selected_count<5&&`${5-run.selected_count} fewer than the five-artwork target; no placeholders added.`}</p>}
          <p className="text-xs text-text-secondary">Generated {new Date(run.captured_at).toLocaleString()} · metadata-v1</p>
          {run.failure_code&&<p role="alert">Preparation failed: {run.failure_code}. Review the candidate limit or retry with Regenerate.</p>}
          {stale&&['GENERATED','APPROVED'].includes(run.status)&&<p role="alert" className="text-danger">Selection changed or lost eligibility. Reject and regenerate before scheduling.</p>}
          {run.status==='SCHEDULED'&&<p>Committed auction selection. Later changes must be reviewed through existing auction oversight; this snapshot will not be replaced.</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{selected.map(c=><article key={c.id} className="min-w-0 rounded border border-border p-3">
          {c.thumbnail?<img src={c.thumbnail} alt={c.snapshot.title} className="mb-2 h-32 w-full object-contain"/>:<p className="text-xs">Thumbnail unavailable — refresh eligibility before scheduling.</p>}
          <h3 className="font-medium">{c.selected_position}. {c.snapshot.title}</h3><p className="text-sm">{c.snapshot.artist??'Artist'} · {c.snapshot.category}</p>
          <p className="text-sm">Rank {c.rank} · {c.score.toFixed(3)} / 100 · available {c.snapshot.available}</p>
          <p className="mt-2 text-xs text-text-secondary">{c.explanation}</p>
          <p className="mt-1 text-xs">{Object.entries(c.components).filter(([k])=>k!=='total').map(([k,v])=>`${k}: ${v}`).join(' · ')}</p>
          {c.snapshot.analysisEvidence&&<details className="mt-2 text-xs"><summary>Existing stored model findings</summary>
            <p>{c.snapshot.analysisEvidence.provider} / {c.snapshot.analysisEvidence.model}</p><p>{c.snapshot.analysisEvidence.summary}</p>
            <p>Stored image source matches. These findings are not an objective artistic-quality score.</p></details>}
          {c.stale&&<p className="text-xs text-text-secondary">Current evidence differs from this saved recommendation. {c.currentReasons.join(', ')}</p>}
        </article>)}</div>
        <details><summary className="cursor-pointer">Inspect candidate ranking and eligibility</summary>
          <ol className="mt-2 max-h-72 overflow-y-auto text-sm">{data.candidates.map(c=><li key={c.id} className="border-b border-border py-2">{c.rank??'Excluded'}. {c.snapshot.title} · {c.score.toFixed(3)} · {c.reasons.join(', ')}{c.stale?' · STALE':''}</li>)}</ol></details>
        <label className="text-sm">Review reason<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} className="mt-1 w-full rounded border border-border bg-surface p-2"/></label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy||['SCHEDULED','SUPERSEDED'].includes(run.status)} onClick={()=>void act(()=>reviewSelection(run.id,'REFRESH',reason),'Eligibility refreshed. Snapshots preserved.')}>Refresh eligibility</Button>
          <Button disabled={busy||run.status!=='GENERATED'||!run.selected_count||stale} onClick={()=>void act(()=>reviewSelection(run.id,'APPROVE',reason),'Selection approved; not yet scheduled.')}>Approve selection</Button>
          <Button disabled={busy||!['GENERATED','APPROVED','FAILED'].includes(run.status)} onClick={()=>void act(()=>reviewSelection(run.id,'REJECT',reason),'Selection rejected.')}>Reject selection</Button>
          <Button disabled={busy||!['GENERATED','REJECTED','FAILED'].includes(run.status)} onClick={()=>void act(async()=>{setRunId(await reviewSelection(run.id,'REGENERATE',reason))},'Generation request recorded. Review the run status below.')}>Regenerate selection</Button>
          <Button variant="gold" disabled={busy||run.status!=='APPROVED'||stale} onClick={()=>void act(async()=>{await scheduleSelection(run.id);onScheduled?.()},'One weekly event scheduled with the approved lots.')}>Schedule approved auction</Button>
        </div>
      </>}
    </>}
  </Card>
}
