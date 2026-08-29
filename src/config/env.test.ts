import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from '@/config/env'

describe('env', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('falls back to demo/emulator-safe values when no .env is present', () => {
    expect(env.VITE_FIREBASE_PROJECT_ID).toBe('demo-artvault')
    expect(env.VITE_USE_FIREBASE_EMULATORS).toBe(true)
  })

  it('fails safely, with an actionable error, when a variable is set but invalid', async () => {
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '')
    vi.resetModules()

    await expect(import('@/config/env')).rejects.toThrow(/environment configuration is invalid/i)
  })
})
