/**
 * Shared utility that derives physical display dimensions for all three
 * ArtVault AR modes (Level 1 WebXR, Level 2 Camera Overlay, Level 3 3D Gallery).
 *
 * Dimension source priority:
 *  1. ArProof  — seller-supplied physical measurements (most accurate)
 *  2. Image intrinsic — natural pixel ratio * a standard default width
 *  3. Default  — 500 × 667 mm (3:4 portrait, ~50 cm wide)
 */

import type { ArProof } from './proof'

/** All units in millimetres. */
export interface ArtworkArDimensions {
  /** Total width including frame. */
  widthMm: number
  /** Total height including frame. */
  heightMm: number
  /** Canvas-only width (excluding frame border). */
  artworkWidthMm: number
  /** Canvas-only height (excluding frame border). */
  artworkHeightMm: number
  /** Frame border thickness on each side. */
  frameMm: number
  /** width / height ratio. */
  aspectRatio: number
  /** How the dimensions were derived. */
  source: 'proof' | 'image-intrinsic' | 'default'
}

/**
 * Standard display width applied when no proof or explicit dimensions exist.
 * ~50 cm is a common mid-size gallery canvas.
 */
export const DEFAULT_DISPLAY_WIDTH_MM = 500

/**
 * Scale factor applied to the Three.js mesh size relative to the logical
 * metre dimension.  Provides a small visual inset so the frame is not
 * flush with the computed physical boundary.
 */
export const MESH_FIT_FACTOR = 0.92

/** Derive dimensions directly from an ArProof object. */
export function artworkArDimensionsFromProof(
  proof: ArProof,
): ArtworkArDimensions {
  const widthMm = proof.widthMm
  const heightMm = proof.heightMm
  const frameMm = proof.frameMm
  const artworkWidthMm = proof.artworkWidthMm ?? widthMm - frameMm * 2
  const artworkHeightMm = proof.artworkHeightMm ?? heightMm - frameMm * 2

  return {
    widthMm,
    heightMm,
    artworkWidthMm,
    artworkHeightMm,
    frameMm,
    aspectRatio: widthMm / heightMm,
    source: 'proof',
  }
}

/**
 * Derive dimensions from an image aspect ratio.
 * Uses DEFAULT_DISPLAY_WIDTH_MM as the reference width and derives height
 * proportionally.  Frame thickness is computed as 5% of the shorter side,
 * clamped between 15 mm and 30 mm.
 */
export function artworkArDimensionsFromAspect(
  imageAspect: number,
): ArtworkArDimensions {
  const safeAspect =
    Number.isFinite(imageAspect) && imageAspect > 0 ? imageAspect : 3 / 4

  const widthMm = DEFAULT_DISPLAY_WIDTH_MM
  const heightMm = Math.round(widthMm / safeAspect)
  const shortSide = Math.min(widthMm, heightMm)
  const frameMm = Math.max(15, Math.min(30, Math.round(shortSide * 0.05)))
  const artworkWidthMm = widthMm - frameMm * 2
  const artworkHeightMm = heightMm - frameMm * 2

  return {
    widthMm,
    heightMm,
    artworkWidthMm,
    artworkHeightMm,
    frameMm,
    aspectRatio: widthMm / heightMm,
    source: 'image-intrinsic',
  }
}

/** Return the 3:4 portrait default when no other information is available. */
export function artworkArDimensionsDefault(): ArtworkArDimensions {
  return artworkArDimensionsFromAspect(3 / 4)
}

/**
 * Load an image URL in a temporary Image element and resolve its natural
 * pixel aspect ratio (width / height).  Resolves to null on any error.
 *
 * Safe to call in a browser environment only (uses the DOM Image API).
 */
export function detectImageAspect(url: string): Promise<number | null> {
  return new Promise<number | null>((resolve) => {
    if (!url) {
      resolve(null)
      return
    }

    const ImageConstructor =
      (typeof window !== 'undefined' ? window.Image : undefined) ||
      (typeof globalThis !== 'undefined' ? globalThis.Image : undefined)

    if (!ImageConstructor) {
      resolve(null)
      return
    }

    const img = new ImageConstructor()

    img.onload = () => {
      const { naturalWidth, naturalHeight } = img
      if (naturalWidth > 0 && naturalHeight > 0) {
        resolve(naturalWidth / naturalHeight)
      } else {
        resolve(null)
      }
    }

    img.onerror = () => {
      resolve(null)
    }

    // Setting crossOrigin before src avoids tainted-canvas errors for
    // images served with CORS headers (Supabase storage does this).
    img.crossOrigin = 'anonymous'
    img.src = url
  })
}
