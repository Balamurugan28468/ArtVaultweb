export type ArSizingMode =
  'ESTIMATED_STANDARD_DISPLAY'

export const AR_FRAME_STYLES = [
  'black',
  'walnut',
  'white',
  'gold',
] as const

export type ArFrameStyle =
  (
    typeof AR_FRAME_STYLES
  )[number]

export const AR_FRAME_LABELS: Record<
  ArFrameStyle,
  string
> = {
  black:
    'Black',

  walnut:
    'Walnut',

  white:
    'White',

  gold:
    'Gold',
}

export interface ArFrameVariant {
  label: string
  modelUrl: string
  version: string
}

export interface ArProof {
  artworkId: string
  imageId: string

  sizingMode:
    ArSizingMode

  artworkWidthMm:
    number

  artworkHeightMm:
    number

  frameMm: number

  widthMm: number
  heightMm: number

  includesFrame:
    boolean

  defaultFrame:
    ArFrameStyle

  frames: Record<
    ArFrameStyle,
    ArFrameVariant
  >

  modelUrl: string
  version: string
}

function validDimension(
  value: unknown,
): value is number {
  return (
    typeof value ===
      'number' &&
    Number.isFinite(
      value,
    ) &&
    value > 0 &&
    value <=
      10000
  )
}

function isFrameStyle(
  value: unknown,
): value is ArFrameStyle {
  return (
    typeof value ===
      'string' &&
    (
      AR_FRAME_STYLES as
        readonly string[]
    ).includes(
      value,
    )
  )
}

function parseFrameVariants(
  value: unknown,
  artworkId: string,
): Record<
  ArFrameStyle,
  ArFrameVariant
> | null {
  if (
    !value ||
    typeof value !==
      'object'
  ) {
    return null
  }

  const source =
    value as Record<
      string,
      unknown
    >

  const result =
    {} as Record<
      ArFrameStyle,
      ArFrameVariant
    >

  for (
    const style
    of AR_FRAME_STYLES
  ) {
    const raw =
      source[
        style
      ]

    if (
      !raw ||
      typeof raw !==
        'object'
    ) {
      return null
    }

    const variant =
      raw as
        Partial<
          ArFrameVariant
        >

    if (
      variant.label !==
        AR_FRAME_LABELS[
          style
        ] ||
      typeof variant
        .version !==
        'string' ||
      !/^[a-f0-9]{64}$/
        .test(
          variant.version,
        ) ||
      variant.modelUrl !==
        `/__ar-proof/model/${artworkId}/${variant.version}.glb`
    ) {
      return null
    }

    result[
      style
    ] = {
      label:
        variant.label,

      modelUrl:
        variant.modelUrl,

      version:
        variant.version,
    }
  }

  return result
}

export function parseProof(
  value: unknown,
  artworkId: string,
): ArProof | null {
  if (
    !value ||
    typeof value !==
      'object'
  ) {
    return null
  }

  const proof =
    value as
      Partial<ArProof>

  if (
    proof.artworkId !==
      artworkId ||
    typeof proof
      .imageId !==
      'string' ||
    proof.sizingMode !==
      'ESTIMATED_STANDARD_DISPLAY' ||
    proof.includesFrame !==
      true ||
    !validDimension(
      proof
        .artworkWidthMm,
    ) ||
    !validDimension(
      proof
        .artworkHeightMm,
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
    !isFrameStyle(
      proof.defaultFrame,
    ) ||
    typeof proof
      .version !==
      'string' ||
    !/^[a-f0-9]{64}$/
      .test(
        proof.version,
      )
  ) {
    return null
  }

  const frames =
    parseFrameVariants(
      proof.frames,
      artworkId,
    )

  if (
    !frames
  ) {
    return null
  }

  const defaultVariant =
    frames[
      proof.defaultFrame
    ]

  if (
    proof.version !==
      defaultVariant
        .version ||
    proof.modelUrl !==
      defaultVariant
        .modelUrl
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

  return {
    ...(
      proof as ArProof
    ),

    frames,
  }
}