export const MIN_AR_SCALE =
  0.35

export const MAX_AR_SCALE =
  3

export function clampArScale(
  value: number,
): number {
  if (
    !Number.isFinite(
      value,
    )
  ) {
    return 1
  }

  return Math.min(
    MAX_AR_SCALE,
    Math.max(
      MIN_AR_SCALE,
      value,
    ),
  )
}

export interface ScaledDisplaySize {
  widthMm: number
  heightMm: number
  widthCm: number
  heightCm: number
  scale: number
  scalePercent: number
}

export function scaleDisplaySize(
  widthMm: number,
  heightMm: number,
  requestedScale: number,
): ScaledDisplaySize {
  const scale =
    clampArScale(
      requestedScale,
    )

  const scaledWidth =
    widthMm *
    scale

  const scaledHeight =
    heightMm *
    scale

  return {
    widthMm:
      scaledWidth,

    heightMm:
      scaledHeight,

    widthCm:
      scaledWidth / 10,

    heightCm:
      scaledHeight / 10,

    scale,

    scalePercent:
      Math.round(
        scale * 100,
      ),
  }
}

export function formatArCentimetres(
  centimetres: number,
): string {
  if (
    !Number.isFinite(
      centimetres,
    )
  ) {
    return '0'
  }

  return centimetres
    .toFixed(1)
    .replace(
      /\.0$/,
      '',
    )
}