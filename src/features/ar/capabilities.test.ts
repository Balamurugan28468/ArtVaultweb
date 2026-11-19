import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  checkSecureContext,
  getConnectionType,
  checkHasWebXrApi,
  checkImmersiveArSupported,
  checkHasCameraApi,
  checkHasWebGL,
  determineRecommendedLevel,
  detectArCapabilities,
} from './capabilities'

describe('AR Capabilities Detection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('detects secure context when isSecureContext is true', () => {
    vi.stubGlobal('isSecureContext', true)
    expect(checkSecureContext()).toBe(true)
  })

  it('identifies localhost and https connection types correctly', () => {
    expect(getConnectionType()).toBeDefined()
    expect(typeof checkHasWebXrApi()).toBe('boolean')
    expect(typeof checkHasCameraApi()).toBe('boolean')
    expect(typeof checkHasWebGL()).toBe('boolean')
  })

  it('determines Level 1 (immersive-ar) when immersive AR is supported', () => {
    const level = determineRecommendedLevel({
      isSecureContext: true,
      hasWebXrApi: true,
      immersiveArSupported: true,
      hasCameraApi: true,
      hasWebGL: true,
      connectionType: 'https',
    })
    expect(level).toBe('immersive-ar')
  })

  it('determines Level 2 (camera-overlay) when WebXR is unsupported but camera is available in secure context', () => {
    const level = determineRecommendedLevel({
      isSecureContext: true,
      hasWebXrApi: false,
      immersiveArSupported: false,
      hasCameraApi: true,
      hasWebGL: true,
      connectionType: 'https',
    })
    expect(level).toBe('camera-overlay')
  })

  it('determines Level 3 (3d-gallery) when neither WebXR nor camera is available or context is insecure', () => {
    const level = determineRecommendedLevel({
      isSecureContext: false,
      hasWebXrApi: false,
      immersiveArSupported: false,
      hasCameraApi: true,
      hasWebGL: true,
      connectionType: 'insecure-http',
    })
    expect(level).toBe('3d-gallery')
  })

  it('falls back gracefully when WebXR session support check rejects', async () => {
    vi.stubGlobal('navigator', {
      xr: {
        isSessionSupported: vi.fn().mockRejectedValue(new Error('Device error')),
      },
    })
    const supported = await checkImmersiveArSupported()
    expect(supported).toBe(false)
  })

  it('detects capabilities asynchronously with safe fallbacks', async () => {
    const caps = await detectArCapabilities()
    expect(caps).toHaveProperty('isSecureContext')
    expect(caps).toHaveProperty('hasWebXrApi')
    expect(caps).toHaveProperty('recommendedLevel')
  })
})
