import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from '@/config/env'

describe('env', () => {
  it('keeps Razorpay test checkout off without explicit opt-in', async () => {
    vi.stubEnv('VITE_ENABLE_RAZORPAY_TEST', '')
    vi.resetModules()
    const { env: reloadedEnv } = await import('@/config/env')
    expect(reloadedEnv.VITE_ENABLE_RAZORPAY_TEST).toBe(false)
  })
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
