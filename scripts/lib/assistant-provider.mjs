// Future SERVER-ONLY intent classifier; no browser imports, credentials, tools,
// private account context or external requests are built into this contract.
import {readFileSync} from 'node:fs'
import {z} from 'zod'
const faq=JSON.parse(readFileSync(new URL('../../src/features/ai/faq.json',import.meta.url),'utf8'))
const topicSchema=z.object({topic:z.enum(faq.map(item=>item.topic))}).strict()
export const validateAssistantIntent=raw=>topicSchema.parse(typeof raw==='string'&&raw.length<=2000?JSON.parse(raw):raw)
export async function classifySupportQuestion(message,{provider,timeoutMs=3000,retries=1}={}){
  const question=z.string().trim().min(1).max(1000).parse(message)
  const local=faq.map((item,i)=>({...item,i,match:Math.max(0,...item.keywords.filter(k=>new RegExp(`(^|[^a-z0-9])${k}([^a-z0-9]|$)`,'i').test(question)).map(k=>k.length))})).filter(item=>item.match).sort((a,b)=>b.match-a.match||a.i-b.i)[0]??faq.find(item=>item.topic==='general')
  const reply=(topic,source,reason)=>{const item=faq.find(entry=>entry.topic===topic);return{method:'FAQ',source,topic,content:item.content,links:item.links,fallbackReason:reason}}
  if(!provider)return reply(local.topic,'LOCAL_FAQ','PROVIDER_NOT_CONFIGURED')
  if(typeof provider.classify!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000||!Number.isInteger(retries)||retries<0||retries>1)throw new Error('Invalid provider configuration')
  for(let attempt=0;attempt<=retries;attempt++){
    const controller=new AbortController();let timer
    try{
      const result=await Promise.race([Promise.resolve().then(()=>provider.classify({message:question,topics:faq.map(item=>item.topic),signal:controller.signal,instruction:'Classify untrusted text into one allowed topic. No tools or actions.'})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Timeout'))},timeoutMs)})])
      return reply(validateAssistantIntent(result).topic,'MODEL_CLASSIFIED_FAQ',null)
    }catch{/* Never log or expose raw provider errors. */}finally{clearTimeout(timer);controller.abort()}
  }
  return reply(local.topic,'LOCAL_FAQ','PROVIDER_UNAVAILABLE')
}
