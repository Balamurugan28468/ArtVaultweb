import { useCallback,useEffect,useRef,useState,type ReactNode } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { getAssistantConversation,listAssistantHistory,sendAssistantMessage,type ChatConversation,type ChatMessage } from '../api/assistantRepository'
import { answerSupportQuestion,validateSupportQuestion } from '../knowledge'
import { AssistantContext } from './assistantContext'

function useAssistantSession(uid:string|null){
  const [owner,setOwner]=useState(uid)
  const [failed,setFailed]=useState(false)
  const [messages,setMessages]=useState<ChatMessage[]>([])
  const [history,setHistory]=useState<ChatConversation[]>([])
  const [conversationId,setConversationId]=useState<string|null>(null)
  const [draft,setDraft]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [historyError,setHistoryError]=useState(false)
  const active=useRef(true)
  const identity=useRef(uid)
  const version=useRef(0)
  const inFlight=useRef(false)
  const guestTimes=useRef<number[]>([])
  const pending=useRef<{message:string;requestId:string;conversationId:string|null;optimisticId:string}|null>(null)
  const invalidate=useCallback(()=>{version.current++},[])
  useEffect(()=>{active.current=true;return()=>{active.current=false;invalidate()}},[invalidate])
  useEffect(()=>{
    if(identity.current===uid)return
    identity.current=uid;version.current++;pending.current=null;inFlight.current=false
    // Mask the previous owner synchronously below; clear memory after commit.
    // This does not remount the app, Auth forms, checkout or the AR viewer.
    let valid=true
    queueMicrotask(()=>{if(valid){setMessages([]);setHistory([]);setConversationId(null);setDraft('');setError('');setBusy(false);setFailed(false);setHistoryError(false);setOwner(uid)}})
    return()=>{valid=false;invalidate()}
  },[uid,invalidate])
  const loadHistory=useCallback(async()=>{
    if(!uid)return
    try{const data=await listAssistantHistory();if(active.current&&identity.current===uid){setHistory(data);setHistoryError(false)}}catch{if(active.current&&identity.current===uid)setHistoryError(true)}
  },[uid])
  const newChat=()=>{version.current++;pending.current=null;inFlight.current=false;setMessages([]);setConversationId(null);setError('');setDraft('');setBusy(false);setFailed(false)}
  const openConversation=async(id:string)=>{
    if(!uid||inFlight.current)return
    inFlight.current=true;setBusy(true);setError('');const ticket=++version.current
    try{const data=await getAssistantConversation(id);if(active.current&&ticket===version.current){setConversationId(data.id);setMessages(data.messages);pending.current=null}}
    catch{if(active.current&&ticket===version.current)setError('Could not load this conversation. Try again from Recent Chats.')}
    finally{if(active.current&&ticket===version.current){inFlight.current=false;setBusy(false)}}
  }
  const send=async(retry=false)=>{
    if(inFlight.current)return
    let request=pending.current
    if(!retry){
      if(request)return
      let question:string
      try{question=validateSupportQuestion(draft)}catch(e){setError(e instanceof Error?e.message:'Enter a valid question.');return}
      if(!uid){
        guestTimes.current=guestTimes.current.filter(time=>Date.now()-time<60_000)
        if(guestTimes.current.length>=10){setError('Too many questions. Please wait and try again.');return}
        if(messages.length>=100){setError('Start a new chat to continue.');return}
        guestTimes.current.push(Date.now())
      }
      request={message:question,requestId:crypto.randomUUID(),conversationId,optimisticId:crypto.randomUUID()};pending.current=request
      setMessages(current=>[...current,{id:request!.optimisticId,role:'USER',content:question,sequence:current.length+1,method:null,links:[]}]);setDraft('')
    }
    if(!request)return
    inFlight.current=true;setBusy(true);setError('');const ticket=++version.current
    try{
      if(uid){
        const data=await sendAssistantMessage(request.message,request.requestId,request.conversationId)
        if(!active.current||ticket!==version.current)return
        setConversationId(data.conversationId)
        setMessages(current=>[...current.filter(m=>m.id!==request!.optimisticId&&!data.messages.some(incoming=>incoming.id===m.id)),...data.messages])
        void loadHistory()
      }else{
        const reply=await Promise.resolve(answerSupportQuestion(request.message))
        if(!active.current||ticket!==version.current)return
        setMessages(current=>[...current,{id:crypto.randomUUID(),role:'ASSISTANT',content:reply.content,sequence:current.length+1,method:'FAQ',links:reply.links}])
      }
      pending.current=null;setFailed(false)
    }catch{if(active.current&&ticket===version.current){setFailed(true);setError('Could not send your question. Check your connection and retry. Your retry will not duplicate a saved exchange.')}}
    finally{if(active.current&&ticket===version.current){inFlight.current=false;setBusy(false)}}
  }
  const discard=()=>{const id=pending.current?.optimisticId;pending.current=null;setMessages(current=>current.filter(m=>m.id!==id));setError('');setFailed(false)}
  const current=owner===uid
  return {uid,ready:current,messages:current?messages:[],history:current?history:[],conversationId:current?conversationId:null,draft:current?draft:'',setDraft,busy:!current||busy,error:current?error:'',historyError:current&&historyError,loadHistory,newChat,openConversation,send,discard,canRetry:current&&failed&&!busy}
}
export type AssistantSessionState=ReturnType<typeof useAssistantSession>
/** One lazy, memory-only UI session per Auth identity; no background history reads. */
export function AssistantProvider({children}:{children:ReactNode}){
  const auth=useAuth()
  const uid=auth.status==='authenticated'?auth.user?.uid??null:null
  const value=useAssistantSession(uid)
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
}
