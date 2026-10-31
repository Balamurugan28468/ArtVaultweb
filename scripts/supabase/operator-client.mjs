// Never import this operator-only module into src/ or browser code.
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { createClient } from '@supabase/supabase-js'
export const projectRef = 'fqxhjijxgdjfthmfokqk'
export const projectUrl = `https://${projectRef}.supabase.co`
export function operatorClient() {
  const env = parseEnv(readFileSync(new URL('../../.env.local', import.meta.url),'utf8'))
  if (env.VITE_SUPABASE_URL !== projectUrl || !env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_')) {
    throw new Error('Expected project URL and local server-only secret key are required')
  }
  return createClient(projectUrl,env.SUPABASE_SECRET_KEY,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??AbortSignal.timeout(30000)})},
  })
}
