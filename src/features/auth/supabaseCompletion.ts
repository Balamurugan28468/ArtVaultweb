import { createClient } from '@/lib/supabase/client'
import { getRedirectPath } from './returnTo'

const destinationKey = 'artvault.supabase.destination'
export function safeDestination(value: string | null) {
  const path = getRedirectPath({ from: value })
  return new URL(path, 'https://artvault.invalid').pathname.startsWith('/auth/') ? '/account' : path
}
export function authCallbackUrl() { return `${window.location.origin}/auth/callback` }

/** Dashboard invites may use Site URL without a callback path. Preserve credentials
 * only until the callback consumes them; never log or copy them to storage. */
export function routeSupabaseReturn() {
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.slice(1))
  if (url.pathname === '/' && (hash.has('access_token') || hash.has('error') || url.searchParams.has('code') || url.searchParams.has('error'))) {
    window.history.replaceState(null, '', `/auth/callback${url.search}${url.hash}`)
  }
}

let completion: Promise<{ email: string; destination: string }> | undefined
/** One exchange per document, including React StrictMode effect replay. */
export function completeSupabaseReturn() {
  return completion ??= consumeReturn()
}
async function consumeReturn() {
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.slice(1))
  let destination = '/account'
  try {
    destination = safeDestination(url.searchParams.get('next') ?? sessionStorage.getItem(destinationKey))
    sessionStorage.setItem(destinationKey, destination)
  } catch { destination = safeDestination(url.searchParams.get('next')) }
  // Remove tokens/codes/errors before network requests or rendering.
  window.history.replaceState(null, '', url.pathname)
  if (hash.has('error') || url.searchParams.has('error')) throw new Error('LINK_INVALID')
  const client = createClient()
  const code = url.searchParams.get('code')
  const access = hash.get('access_token'), refresh = hash.get('refresh_token')
  if (code && (access || refresh)) throw new Error('LINK_INVALID')
  if (code) {
    const result = await client.auth.exchangeCodeForSession(code)
    if (result.error) throw new Error('LINK_INVALID')
  } else if (access || refresh) {
    if (!access || !refresh) throw new Error('LINK_INVALID')
    const result = await client.auth.setSession({ access_token: access, refresh_token: refresh })
    if (result.error) throw new Error('LINK_INVALID')
  }
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new Error('LINK_INVALID')
  return { email: data.user.email ?? '', destination }
}
