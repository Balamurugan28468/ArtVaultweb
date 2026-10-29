import { emailField } from '@/shared/validation/fields'

export const EMAIL_OTP_LENGTH = 6
const gmailTypos = new Set(['gmal.com', 'gmial.com', 'gmai.com', 'gmail.con', 'gmali.com'])

export function getEmailDomainSuggestion(email: string): string | null {
  const parts = email.trim().toLowerCase().split('@')
  return parts.length === 2 && parts[0] && gmailTypos.has(parts[1]) ? 'gmail.com' : null
}

/** Syntax only; mailbox ownership is established by Supabase OTP verification. */
export function authEmailField() {
  return emailField().superRefine((email, ctx) => {
    const [local, domain, extra] = email.split('@')
    if (!local || !domain || extra !== undefined) return
    const labels = domain.split('.')
    if (email.length > 254 || local.length > 64 || local.startsWith('.') || local.endsWith('.') ||
      local.includes('..') || /[<>()[\]\\,;:"]/.test(local) ||
      labels.length < 2 || labels.some(label => !/^[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?$/u.test(label)) ||
      !/^(?:[\p{L}]{2,}|xn--[a-z0-9-]+)$/iu.test(labels.at(-1) ?? '')) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid email address.' })
    }
  })
}
