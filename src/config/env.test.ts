import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from '@/config/env'

describe('env', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('keeps the development AR proof disabled unless explicitly enabled', () => {
    expect(env.VITE_ENABLE_DEVELOPMENT_AR_PROOF).toBe(false)
  })

  it('enables the local AR proof only after an explicit true flag', async () => {
    vi.stubEnv('VITE_ENABLE_DEVELOPMENT_AR_PROOF', 'true')
    vi.resetModules()

    await expect(import('@/config/env')).resolves.toMatchObject({
      env: { VITE_ENABLE_DEVELOPMENT_AR_PROOF: true },
    })
  })
})
