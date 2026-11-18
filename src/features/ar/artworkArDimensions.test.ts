import { describe, expect, it, vi } from 'vitest'
import {
  artworkArDimensionsDefault,
  artworkArDimensionsFromAspect,
  artworkArDimensionsFromProof,
  DEFAULT_DISPLAY_WIDTH_MM,
  detectImageAspect,
} from './artworkArDimensions'
import type { ArProof } from './proof'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProof(overrides: Partial<ArProof> = {}): ArProof {
  return {
    version: 1,
    modelUrl: null,
    widthMm: 600,
    heightMm: 800,
    artworkWidthMm: 560,
    artworkHeightMm: 760,
    frameMm: 20,
    defaultFrame: 'black',
    frames: {
      black: { modelUrl: null },
      walnut: { modelUrl: null },
      white: { modelUrl: null },
      gold: { modelUrl: null },
    },
    ...overrides,
  } as ArProof
}

// ---------------------------------------------------------------------------
// artworkArDimensionsFromProof
// ---------------------------------------------------------------------------

describe('artworkArDimensionsFromProof', () => {
  it('returns exact proof dimensions', () => {
    const proof = makeProof({
      widthMm: 600,
      heightMm: 800,
      artworkWidthMm: 560,
      artworkHeightMm: 760,
      frameMm: 20,
    })
    const dims = artworkArDimensionsFromProof(proof)

    expect(dims.widthMm).toBe(600)
    expect(dims.heightMm).toBe(800)
    expect(dims.artworkWidthMm).toBe(560)
    expect(dims.artworkHeightMm).toBe(760)
    expect(dims.frameMm).toBe(20)
    expect(dims.source).toBe('proof')
  })

  it('computes aspectRatio correctly', () => {
    const proof = makeProof({ widthMm: 800, heightMm: 600 })
    const dims = artworkArDimensionsFromProof(proof)
    expect(dims.aspectRatio).toBeCloseTo(800 / 600, 5)
  })

  it('derives artworkWidthMm from frame when not supplied by proof', () => {
    const proof = makeProof({
      widthMm: 500,
      heightMm: 700,
      frameMm: 25,
      artworkWidthMm: undefined as never,
      artworkHeightMm: undefined as never,
    })
    const dims = artworkArDimensionsFromProof(proof)
    expect(dims.artworkWidthMm).toBe(500 - 25 * 2)
    expect(dims.artworkHeightMm).toBe(700 - 25 * 2)
  })
})

// ---------------------------------------------------------------------------
// artworkArDimensionsFromAspect
// ---------------------------------------------------------------------------

describe('artworkArDimensionsFromAspect', () => {
  it('uses DEFAULT_DISPLAY_WIDTH_MM as the reference width', () => {
    const dims = artworkArDimensionsFromAspect(1)
    expect(dims.widthMm).toBe(DEFAULT_DISPLAY_WIDTH_MM)
  })

  it('derives portrait height from a 3:4 landscape source', () => {
    // 3:4 → width=500, height≈667
    const dims = artworkArDimensionsFromAspect(3 / 4)
    expect(dims.widthMm).toBe(DEFAULT_DISPLAY_WIDTH_MM)
    expect(dims.heightMm).toBeGreaterThan(dims.widthMm)
    expect(dims.source).toBe('image-intrinsic')
  })

  it('derives landscape height from a 16:9 aspect ratio', () => {
    const dims = artworkArDimensionsFromAspect(16 / 9)
    expect(dims.heightMm).toBeLessThan(dims.widthMm)
    expect(dims.aspectRatio).toBeCloseTo(16 / 9, 2)
  })

  it('clamps frame thickness between 15 mm and 30 mm', () => {
    // Very wide aspect — short side is small, 5% would be tiny
    const wide = artworkArDimensionsFromAspect(10)
    expect(wide.frameMm).toBeGreaterThanOrEqual(15)
    expect(wide.frameMm).toBeLessThanOrEqual(30)

    // Square
    const square = artworkArDimensionsFromAspect(1)
    expect(square.frameMm).toBeGreaterThanOrEqual(15)
    expect(square.frameMm).toBeLessThanOrEqual(30)
  })

  it('falls back to 3:4 for invalid aspect ratios', () => {
    const dimZero = artworkArDimensionsFromAspect(0)
    const dimNeg = artworkArDimensionsFromAspect(-2)
    const dimNaN = artworkArDimensionsFromAspect(NaN)

    for (const dims of [dimZero, dimNeg, dimNaN]) {
      expect(dims.heightMm).toBeGreaterThan(dims.widthMm) // portrait
      expect(dims.source).toBe('image-intrinsic')
    }
  })
})

// ---------------------------------------------------------------------------
// artworkArDimensionsDefault
// ---------------------------------------------------------------------------

describe('artworkArDimensionsDefault', () => {
  it('returns a valid portrait 3:4 default', () => {
    const dims = artworkArDimensionsDefault()
    expect(dims.widthMm).toBe(DEFAULT_DISPLAY_WIDTH_MM)
    expect(dims.heightMm).toBeGreaterThan(dims.widthMm)
    expect(dims.source).toBe('image-intrinsic') // derived via fromAspect
  })
})

// ---------------------------------------------------------------------------
// detectImageAspect
// ---------------------------------------------------------------------------

describe('detectImageAspect', () => {
  it('resolves null for an empty URL', async () => {
    const result = await detectImageAspect('')
    expect(result).toBeNull()
  })

  it('resolves a correct aspect ratio when the image loads', async () => {
    // Simulate a 400×300 image (aspect 4:3)
    class MockImage {
      crossOrigin = ''
      naturalWidth = 400
      naturalHeight = 300
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      private _src = ''

      get src() {
        return this._src
      }

      set src(url: string) {
        this._src = url
        setTimeout(() => {
          this.onload?.()
        }, 0)
      }
    }

    vi.stubGlobal('Image', MockImage)

    const result = await detectImageAspect('https://example.com/image.jpg')
    expect(result).toBeCloseTo(4 / 3, 5)

    vi.unstubAllGlobals()
  })

  it('resolves null when the image fails to load', async () => {
    class MockFailingImage {
      crossOrigin = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      private _src = ''

      get src() {
        return this._src
      }

      set src(url: string) {
        this._src = url
        setTimeout(() => {
          this.onerror?.()
        }, 0)
      }
    }

    vi.stubGlobal('Image', MockFailingImage)

    const result = await detectImageAspect('https://example.com/broken.jpg')
    expect(result).toBeNull()

    vi.unstubAllGlobals()
  })
})
