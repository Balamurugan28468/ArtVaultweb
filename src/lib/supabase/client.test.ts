import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ createClient: vi.fn(() => ({ auth: {} })) }))
vi.mock('@supabase/supabase-js', () => sdk)
beforeEach(() => { vi.resetModules(); sdk.createClient.mockClear() })
afterEach(() => vi.unstubAllEnvs())

describe('inactive Supabase SPA client foundation', () => {
  it('does not create a client merely by importing the module', async () => {
    await import('./client')
    expect(sdk.createClient).not.toHaveBeenCalled()
  })
  it('creates one browser client with only publishable configuration', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
    const { createClient } = await import('./client')
    expect(createClient()).toBe(createClient())
    expect(sdk.createClient).toHaveBeenCalledExactlyOnceWith('https://example.supabase.co', 'sb_publishable_test', { auth: { detectSessionInUrl: false } })
  })
  it.each(['', 'sb_secret_not_allowed', 'legacy-service-role-token'])('rejects absent/privileged key %s', async (key) => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', key)
    const { createClient } = await import('./client')
    expect(() => createClient()).toThrow('publishable browser key')
    expect(sdk.createClient).not.toHaveBeenCalled()
  })
  it.each(['http://example.supabase.co', 'https://user:password@example.supabase.co'])('rejects insecure URL %s', async (url) => {
    vi.stubEnv('VITE_SUPABASE_URL', url)
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
    const { createClient } = await import('./client')
    expect(() => createClient()).toThrow('HTTPS URL without credentials')
    expect(sdk.createClient).not.toHaveBeenCalled()
  })
})
