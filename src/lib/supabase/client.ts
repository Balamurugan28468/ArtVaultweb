import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from '@supabase/supabase-js'

let client: SupabaseClient | undefined
let registrationClient: SupabaseClient | undefined

function browserConfiguration() {
  const url =
    import.meta.env.VITE_SUPABASE_URL

  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

  if (!url) {
    throw new Error(
      'Missing VITE_SUPABASE_URL',
    )
  }

  if (!key) {
    throw new Error(
      'Missing VITE_SUPABASE_PUBLISHABLE_KEY',
    )
  }

  if (
    !key.startsWith(
      'sb_publishable_',
    )
  ) {
    throw new Error(
      'VITE_SUPABASE_PUBLISHABLE_KEY must contain the Supabase publishable browser key.',
    )
  }

  let parsed: URL

  try {
    parsed = new URL(url)
  } catch {
    throw new Error(
      'VITE_SUPABASE_URL must be a valid URL.',
    )
  }

  if (
    parsed.protocol !== 'https:'
  ) {
    throw new Error(
      'Supabase URL must use HTTPS.',
    )
  }

  if (
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      'Supabase URL must not contain credentials.',
    )
  }

  return { url, key }
}

export function createClient(): SupabaseClient {
  if (client) return client
  const { url, key } = browserConfiguration()
  client =
    createSupabaseClient(
      url,
      key,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      },
    )

  return client
}

/** Verification must not sign the application in or persist a temporary session. */
export function createRegistrationClient(): SupabaseClient {
  if (registrationClient) return registrationClient
  const { url, key } = browserConfiguration()
  registrationClient = createSupabaseClient(url, key, {
    auth: {
      storageKey: 'artvault-registration',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
  return registrationClient
}
