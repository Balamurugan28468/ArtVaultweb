import { useEffect,useId,useRef } from 'react'
import { Link } from 'react-router'
import { Button } from '@/shared/ui'
import { useAssistant } from '../context/assistantContext'

export function AssistantChat({compact=false}:{compact?:boolean}){
  const chat=useAssistant()
  const {loadHistory,ready}=chat
  const id=useId()
  const end=useRef<HTMLDivElement>(null)
  useEffect(()=>{if(ready)void loadHistory()},[loadHistory,ready])
  useEffect(()=>{if(end.current?.scrollIntoView)end.current.scrollIntoView({block:'nearest'})},[chat.messages.length])
  return <section aria-label="ArtVault support conversation" className="flex min-h-0 flex-col gap-3">
    <p className="rounded-lg border border-brand-primary/30 bg-brand-primary/10 p-3 text-xs text-text-secondary">Local FAQ guidance — no AI model is connected. {chat.uid?'Conversations are private to your account.':'Guest chats stay in memory and clear when you leave or sign in.'} Do not share passwords, OTPs or payment credentials.</p>
    <div role="log" aria-label="Chat messages" aria-live="polite" aria-relevant="additions" className={`flex flex-col gap-3 overflow-y-auto rounded border border-border p-3 ${compact?'max-h-[35dvh]':'min-h-32 max-h-[45dvh]'}`}>
      {!chat.messages.length&&<p className="text-sm text-text-muted">Ask about ArtVault, checkout, auctions or AR. I do not look up or change private account state.</p>}
      {chat.messages.map(message=><article key={message.id} className={`max-w-full whitespace-pre-wrap break-words rounded-lg p-3 text-sm ${message.role==='USER'?'self-end bg-brand-primary/15':'self-start bg-surface-elevated'}`}>
        <p className="mb-1 text-xs font-semibold text-text-muted">{message.role==='USER'?'You':message.method==='FAQ'?'ArtVault · FAQ':message.method==='MODEL'?'ArtVault · Model':'ArtVault · Saved response'}</p><p>{message.content}</p>
        {message.links.length>0&&<nav aria-label="Suggested ArtVault pages" className="mt-2 flex flex-wrap gap-3">{message.links.map(link=><Link key={link.href} to={link.href} className="text-accent-gold underline">{link.label}</Link>)}</nav>}
      </article>)}<div ref={end}/>
    </div>
    {chat.busy&&<p role="status" className="text-sm">Finding help…</p>}
    {chat.error&&<p role="alert" className="text-sm text-danger">{chat.error}</p>}
    {chat.canRetry&&<div className="flex flex-wrap gap-2"><Button onClick={()=>void chat.send(true)}>Retry question</Button><Button variant="secondary" onClick={chat.discard}>Discard failed message</Button></div>}
    <form onSubmit={event=>{event.preventDefault();void chat.send()}} className="flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">Message ArtVault AI</label>
      <div className="flex min-w-0 items-end gap-2"><textarea id={id} value={chat.draft} onChange={event=>chat.setDraft(event.target.value)} maxLength={1000} rows={2} placeholder="Ask about ArtVault…"
        onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void chat.send()}}}
        className="min-w-0 flex-1 resize-y rounded-md border border-border-strong bg-surface p-3 text-sm"/>
        <Button type="submit" variant="gold" disabled={chat.busy||chat.canRetry||!chat.draft.trim()}>Send</Button></div>
      <p className="text-xs text-text-muted">Enter to send · Shift+Enter for a new line · 1,000 characters maximum</p>
    </form>
  </section>
}
