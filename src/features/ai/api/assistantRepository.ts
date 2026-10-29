import { z } from 'zod'
import { rpc } from '@/lib/supabase/data'
import { supportLinkSchema } from '../knowledge'

export const chatMessageSchema=z.object({id:z.string(),role:z.enum(['USER','ASSISTANT']),content:z.string().min(1).max(20000),sequence:z.number().int().positive(),method:z.enum(['FAQ','MODEL']).nullable(),links:z.array(supportLinkSchema).max(3)})
const conversationSchema=z.object({id:z.string(),title:z.string().max(200),updated_at:z.string()})
export type ChatMessage=z.infer<typeof chatMessageSchema>
export type ChatConversation=z.infer<typeof conversationSchema>
export const listAssistantHistory=async()=>z.array(conversationSchema).max(20).parse(await rpc('get_assistant_history'))
export const getAssistantConversation=async(id:string)=>z.object({id:z.string(),messages:z.array(chatMessageSchema).max(100)}).parse(await rpc('get_assistant_conversation',{p_conversation_id:id}))
export const sendAssistantMessage=async(message:string,requestId:string,conversationId:string|null)=>z.object({conversationId:z.string(),messages:z.array(chatMessageSchema).length(2)}).parse(await rpc('send_assistant_message',{p_message:message,p_request_id:requestId,p_conversation_id:conversationId}))
