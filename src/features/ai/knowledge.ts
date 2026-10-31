import { z } from 'zod'
import rawFaq from './faq.json?raw'

export const supportRoutes = ['/account','/sign-up','/sign-in','/orders','/checkout','/account/addresses','/cart','/explore','/auctions','/seller/apply','/seller-studio','/recommendations','/wishlist'] as const
export const supportLinkSchema = z.object({ label: z.string().min(1).max(80), href: z.enum(supportRoutes) }).strict()
const faqSchema = z.array(z.object({ topic:z.string(),keywords:z.array(z.string().regex(/^[a-z ]+$/)),content:z.string().min(1).max(1800),links:z.array(supportLinkSchema).max(3) }).strict())
export const supportFaq = faqSchema.parse(JSON.parse(rawFaq))
export type SupportReply = { method:'FAQ';topic:string;content:string;links:z.infer<typeof supportLinkSchema>[] }

export function validateSupportQuestion(value:string):string {
  const question=value.trim()
  if(!question || question.length>1000) throw new Error('Enter a question between 1 and 1,000 characters.')
  if(/sb_secret_|-----BEGIN .*PRIVATE KEY|(?:password|otp)\s*[:=]\s*\S/i.test(question)) throw new Error('Do not share credentials or verification codes in chat.')
  return question
}

/** Local FAQ matching, never model inference or an account-state lookup. */
export function answerSupportQuestion(value:string):SupportReply {
  const question=validateSupportQuestion(value).toLowerCase()
  const ranked=supportFaq.map((faq,index)=>({...faq,index,match:Math.max(0,...faq.keywords.filter(word=>new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`,'i').test(question)).map(word=>word.length))}))
    .filter(faq=>faq.match>0).sort((a,b)=>b.match-a.match||a.index-b.index)
  const result=ranked[0]??supportFaq.find(faq=>faq.topic==='general')!
  return {method:'FAQ',topic:result.topic,content:result.content,links:result.links}
}
