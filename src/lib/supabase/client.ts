import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | undefined

export function createClient() {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key?.startsWith('sb_publishable_')) {
    throw new Error('Supabase requires a URL and a publishable browser key.')
  }
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('Supabase cloud configuration must use an HTTPS URL without credentials.')
  }
  // Callback processing is explicit and single-use; never race SDK URL detection.
  client = createSupabaseClient(url, key, { auth: { detectSessionInUrl: false } })
  return client
}
