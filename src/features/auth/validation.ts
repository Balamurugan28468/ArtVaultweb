import { emailField } from '@/shared/validation/fields'

export const EMAIL_OTP_LENGTH = 6

const DOMAIN_TYPO_MAP: Record<string, string> = {
  // Gmail typos
  'gmal.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmali.com': 'gmail.com',
  'gmail.co': 'gmail.com',

  // Yahoo typos
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yaho.co': 'yahoo.com',
  'yahoo.co': 'yahoo.com',

  // Hotmail typos
  'hotmail.co': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',

  // Outlook typos
  'outlok.com': 'outlook.com',
  'outlook.co': 'outlook.com',
}

export function getEmailDomainSuggestion(email: string): string | null {
  const parts = email.trim().toLowerCase().split('@')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return DOMAIN_TYPO_MAP[parts[1]] ?? null
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
