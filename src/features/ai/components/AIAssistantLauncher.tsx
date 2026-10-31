import { Sparkles,Minus } from 'lucide-react'
import { useState } from 'react'
import { Link,useLocation } from 'react-router'
import { Button,Modal } from '@/shared/ui'
import { AssistantChat } from './AssistantChat'
import { useAssistant } from '../context/assistantContext'

export function AIAssistantLauncher(){
  const [open,setOpen]=useState(false)
  const location=useLocation()
  const chat=useAssistant()
  return <>
    <button type="button" onClick={()=>setOpen(true)} aria-label="ArtVault AI Assistant" aria-expanded={open} title="ArtVault AI Assistant"
      className="fixed z-[var(--z-index-floating-action)] flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary-hover text-white shadow-elevated ring-2 ring-brand-primary/40 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] lg:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] sm:h-14 sm:w-14"><Sparkles aria-hidden="true" className="h-6 w-6"/></button>
    <Modal open={open} onClose={()=>setOpen(false)} title="ArtVault AI">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3"><Button variant="secondary" onClick={()=>setOpen(false)}><Minus aria-hidden="true" className="h-4 w-4"/>Minimize chat</Button><Link to="/ai" onClick={()=>setOpen(false)} className="text-sm text-accent-gold underline">Open full AI Assistant →</Link></div>
        {location.pathname.startsWith('/artworks/')&&<Button variant="secondary" onClick={()=>chat.setDraft('How do I open analysis and AR for an artwork?')}>Ask ArtVault AI about this artwork</Button>}
        <AssistantChat compact/>
      </div>
    </Modal>
  </>
}
