/**
 * Universal capability detection for ArtVault AR.
 *
 * Evaluates device, browser, and security capabilities independently
 * to select the best available AR experience:
 * - Level 1: Full Immersive WebXR AR (camera + hit-test surface detection)
 * - Level 2: Camera-based 3D room overlay (live camera feed + interactive 3D placement)
 * - Level 3: 3D Gallery Wall simulation (Three.js studio wall with full placement controls)
 */

export type ArExperienceLevel = 'immersive-ar' | 'camera-overlay' | '3d-gallery'

export interface DeviceArCapabilities {
  /** W3C Secure Context check (required for WebXR and Camera APIs) */
  isSecureContext: boolean
  /** Whether the WebXR Device API is present in the browser */
  hasWebXrApi: boolean
  /** Whether WebXR immersive-ar session type is confirmed supported */
  immersiveArSupported: boolean | null
  /** Whether getUserMedia Camera API is supported */
  hasCameraApi: boolean
  /** Whether WebGL 1/2 is supported */
  hasWebGL: boolean
  /** Detected connection mode: https (production), localhost (USB/dev), or insecure HTTP (LAN IP) */
  connectionType: 'https' | 'localhost' | 'insecure-http'
  /** Automatically recommended experience level */
  recommendedLevel: ArExperienceLevel
}

/** Check if current window is in a secure context */
export function checkSecureContext(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.isSecureContext === 'boolean') {
    return window.isSecureContext
  }
  const hostname = window.location.hostname
  return (
    window.location.protocol === 'https:' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  )
}

/** Determine connection environment */
export function getConnectionType(): 'https' | 'localhost' | 'insecure-http' {
  if (typeof window === 'undefined') return 'insecure-http'
  if (window.location.protocol === 'https:') return 'https'
  const hostname = window.location.hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
    return 'localhost'
  }
  return 'insecure-http'
}

/** Check if WebXR API exists on navigator */
export function checkHasWebXrApi(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'xr' in navigator &&
    typeof (navigator as any).xr?.isSessionSupported === 'function'
  )
}

/** Asynchronously verify whether immersive-ar is supported */
export async function checkImmersiveArSupported(): Promise<boolean> {
  if (!checkHasWebXrApi()) return false
  try {
    const supported = await (navigator as any).xr.isSessionSupported('immersive-ar')
    return Boolean(supported)
  } catch {
    return false
  }
}

/** Check if Camera access API is supported */
export function checkHasCameraApi(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function')
  )
}

/** Check if WebGL context can be created */
export function checkHasWebGL(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    return Boolean(gl)
  } catch {
    return false
  }
}

/** Determine recommended experience level based on verified capabilities */
export function determineRecommendedLevel(
  caps: Omit<DeviceArCapabilities, 'recommendedLevel'>,
): ArExperienceLevel {
  if (caps.immersiveArSupported === true) {
    return 'immersive-ar'
  }
  if (caps.hasCameraApi && caps.isSecureContext) {
    return 'camera-overlay'
  }
  return '3d-gallery'
}

/** Inspect all capabilities in a single synchronous snapshot (with asynchronous WebXR check) */
export async function detectArCapabilities(): Promise<DeviceArCapabilities> {
  const isSecure = checkSecureContext()
  const hasXr = checkHasWebXrApi()
  const hasCam = checkHasCameraApi()
  const hasGl = checkHasWebGL()
  const conn = getConnectionType()

  let immersiveSupported: boolean = false
  if (isSecure && hasXr) {
    immersiveSupported = await checkImmersiveArSupported()
  }

  const base = {
    isSecureContext: isSecure,
    hasWebXrApi: hasXr,
    immersiveArSupported: immersiveSupported,
    hasCameraApi: hasCam,
    hasWebGL: hasGl,
    connectionType: conn,
  }

  return {
    ...base,
    recommendedLevel: determineRecommendedLevel(base),
  }
}

