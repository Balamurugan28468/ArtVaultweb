import { Compass,Gavel,HelpCircle,Menu,MessageSquarePlus,Package,Sparkles,User } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button,Card,Container,Drawer,IconButton } from '@/shared/ui'
import { AssistantChat } from '@/features/ai/components/AssistantChat'
import { useAssistant } from '@/features/ai/context/assistantContext'

const chips=['Show me artworks under ₹5,000','What artworks are in the upcoming auction?','Help me find abstract artworks','Tell me about an artist','How does AR preview work?','Help me understand my order']
const navigation=[{icon:Compass,label:'Discover Art',href:'/explore'},{icon:Sparkles,label:'Artwork Analysis',href:'/explore'},{icon:Gavel,label:'Auction Help',href:'/auctions'},{icon:User,label:'Artist Information',href:'/explore'},{icon:Package,label:'Order & Support',href:'/orders'}]
function SidebarContent({onNavigate}:{onNavigate?:()=>void}){
  const chat=useAssistant()
  return <>
    <Button variant="gold" disabled={chat.busy} onClick={()=>{chat.newChat();onNavigate?.()}}><MessageSquarePlus aria-hidden="true" className="h-4 w-4"/>New Chat</Button>
    <nav aria-label="AI Assistant" className="flex flex-col gap-1">{navigation.map(item=><Link key={item.label} to={item.href} onClick={onNavigate} className="flex gap-2 rounded px-3 py-2 text-sm text-text-secondary hover:bg-surface-elevated"><item.icon aria-hidden="true" className="h-4 w-4"/>{item.label}</Link>)}
      <button type="button" onClick={()=>{chat.setDraft('How do I use ArtVault?');onNavigate?.()}} className="flex gap-2 px-3 py-2 text-left text-sm"><HelpCircle aria-hidden="true" className="h-4 w-4"/>Tips &amp; Guides</button></nav>
    <div className="flex flex-col gap-2 border-t border-border pt-4"><p className="text-xs font-semibold uppercase text-text-muted">Recent Chats</p>
      {!chat.history.length&&<p className="text-sm text-text-muted">No saved conversations yet.</p>}
      {chat.history.map(item=><button key={item.id} type="button" disabled={chat.busy} onClick={()=>{void chat.openConversation(item.id);onNavigate?.()}} className="rounded border border-border p-2 text-left text-xs">{item.title}<br/><span className="text-text-muted">{new Date(item.updated_at).toLocaleString()}</span></button>)}
      {chat.historyError&&<><p role="status" className="text-xs">Could not load saved chats.</p><Button variant="secondary" onClick={()=>void chat.loadHistory()}>Retry history</Button></>}
      {!chat.uid&&<p className="text-xs text-text-muted">Sign in to save conversations. Guest chats are not stored.</p>}
    </div>
  </>
}
export function AIAssistantPage(){
  const [menuOpen,setMenuOpen]=useState(false)
  const chat=useAssistant()
  return <Container size="wide">
    <div className="mb-4 flex items-center gap-2 lg:hidden"><IconButton icon={<Menu className="h-5 w-5"/>} label="Open AI Assistant menu" onClick={()=>setMenuOpen(true)}/><h1 className="font-display text-lg">AI Assistant</h1></div>
    <Drawer open={menuOpen} onClose={()=>setMenuOpen(false)} title="AI Assistant" side="left"><div className="flex h-full flex-col gap-4"><SidebarContent onNavigate={()=>setMenuOpen(false)}/></div></Drawer>
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start"><aside className="hidden w-64 shrink-0 flex-col gap-4 lg:flex"><h1 className="font-display text-lg">AI Assistant</h1><SidebarContent/></aside>
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="flex flex-col items-center gap-2 py-6 text-center"><Sparkles aria-hidden="true" className="h-12 w-12 text-brand-primary-on-dark"/><h2 className="font-display text-2xl">Hello, I'm ArtVault AI</h2><p className="text-sm text-text-secondary">Discover, explore and get practical ArtVault help.</p></div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[{title:'Find Artworks',href:'/explore'},{title:'Analyze Artwork',href:'/explore'},{title:'Explore Auctions',href:'/auctions'},{title:'Artist Information',href:'/explore'}].map(item=><Link key={item.title} to={item.href}><Card className="h-full p-4 text-sm hover:border-accent-gold/50">{item.title}</Card></Link>)}</div>
        <div className="flex flex-wrap gap-2">{chips.map(chip=><button key={chip} type="button" onClick={()=>chat.setDraft(chip)} className="rounded-full border border-border-strong px-3 py-1.5 text-sm text-text-secondary">{chip}</button>)}</div>
        <AssistantChat/>
      </div>
    </div>
  </Container>
}
