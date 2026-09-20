export type ArSizingMode =
  'ESTIMATED_STANDARD_DISPLAY'

export interface ArProof {
  artworkId: string
  imageId: string

  sizingMode: ArSizingMode

  artworkWidthMm: number
  artworkHeightMm: number

  frameMm: number

  widthMm: number
  heightMm: number

  includesFrame: boolean

  modelUrl: string
  version: string
}

function validDimension(
  value: unknown,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 10000
  )
}

export function parseProof(
  value: unknown,
  artworkId: string,
): ArProof | null {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return null
  }

  const proof =
    value as Partial<ArProof>

  if (
    proof.artworkId !==
      artworkId ||
    typeof proof.imageId !==
      'string' ||
    proof.sizingMode !==
      'ESTIMATED_STANDARD_DISPLAY' ||
    proof.includesFrame !==
      true ||
    !validDimension(
      proof.artworkWidthMm,
    ) ||
    !validDimension(
      proof.artworkHeightMm,
    ) ||
    !validDimension(
      proof.frameMm,
    ) ||
    !validDimension(
      proof.widthMm,
    ) ||
    !validDimension(
      proof.heightMm,
    ) ||
    typeof proof.version !==
      'string' ||
    !/^[a-f0-9]{64}$/.test(
      proof.version,
    ) ||
    proof.modelUrl !==
      `/__ar-proof/model/${proof.version}.glb`
  ) {
    return null
  }

  const expectedWidth =
    proof.artworkWidthMm +
    proof.frameMm * 2

  const expectedHeight =
    proof.artworkHeightMm +
    proof.frameMm * 2

  if (
    Math.abs(
      proof.widthMm -
        expectedWidth,
    ) > 0.2 ||
    Math.abs(
      proof.heightMm -
        expectedHeight,
    ) > 0.2
  ) {
    return null
  }

  return proof as ArProof
}