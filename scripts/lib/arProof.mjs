import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

export const PROOF_DIRECTORY = 'ar-proof.local'
export const PROOF_PREFIX = '/__ar-proof/'

const ARTWORK_IMAGE_BUCKET = 'artwork-images'

const MAX_SOURCE_BYTES = 10 * 1024 * 1024
const MAX_MODEL_BYTES = 5 * 1024 * 1024

const MAX_SOURCE_PIXELS = 100_000_000
const MAX_SOURCE_EDGE_PIXELS = 16_384
const MAX_TEXTURE_EDGE_PIXELS = 2000
const MAX_INPUT_CHANNELS = 5

const SIGNED_URL_TTL_SECONDS = 180
const DOWNLOAD_TIMEOUT_MS = 45_000
const DOWNLOAD_ATTEMPTS = 3

const DOWNLOAD_RETRY_DELAYS_MS = [
  0,
  750,
  2000,
]

const FRAME_MM = 30

// Physical depth of the generated framed model.
//
// This does not claim to represent the seller's real physical frame.
// It is an AR visualization profile so wall placement has a meaningful
// back surface rather than a mathematically flat plane.
const FRAME_DEPTH_MM = 12

// Move the textured artwork plane slightly in front of the solid backing
// to avoid z-fighting.
const FRONT_OFFSET_MM = 0.5

const SCHEMA_VERSION = 6

const SIZING_MODE =
  'ESTIMATED_STANDARD_DISPLAY'

const GENERATOR_VERSION =
  'v7-multi-supabase-3d-frame-safe-resize'

export const DEFAULT_FRAME_STYLE =
  'black'

export const FRAME_STYLES =
  Object.freeze({
    black: Object.freeze({
      label: 'Black',

      color: Object.freeze({
        r: 22,
        g: 22,
        b: 22,
        alpha: 1,
      }),

      metallicFactor: 0.05,
      roughnessFactor: 0.55,
    }),

    walnut: Object.freeze({
      label: 'Walnut',

      color: Object.freeze({
        r: 103,
        g: 68,
        b: 43,
        alpha: 1,
      }),

      metallicFactor: 0,
      roughnessFactor: 0.78,
    }),

    white: Object.freeze({
      label: 'White',

      color: Object.freeze({
        r: 238,
        g: 235,
        b: 226,
        alpha: 1,
      }),

      metallicFactor: 0.02,
      roughnessFactor: 0.62,
    }),

    gold: Object.freeze({
      label: 'Gold',

      color: Object.freeze({
        r: 184,
        g: 146,
        b: 58,
        alpha: 1,
      }),

      metallicFactor: 0.65,
      roughnessFactor: 0.35,
    }),
  })

const FRAME_STYLE_KEYS =
  Object.freeze(
    Object.keys(
      FRAME_STYLES,
    ),
  )

const ALLOWED_IMAGE_TYPES =
  new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
  ])

const proofLocks =
  new Map()

export const sha256 = (
  bytes,
) =>
  createHash('sha256')
    .update(bytes)
    .digest('hex')

const safeId = (
  value,
) =>
  typeof value === 'string' &&
  /^[A-Za-z0-9_-]{1,128}$/.test(value)

const safeImageId = (
  value,
) =>
  typeof value === 'string' &&
  /^[A-Za-z0-9_.-]{1,200}$/.test(value)

const round1 = (
  value,
) =>
  Math.round(
    value * 10,
  ) / 10

function sleep(
  milliseconds,
) {
  if (!milliseconds) {
    return Promise.resolve()
  }

  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds,
      )
    },
  )
}

function isFrameStyle(
  value,
) {
  return (
    typeof value === 'string' &&
    FRAME_STYLE_KEYS.includes(
      value,
    )
  )
}

function parseEnvText(
  text,
) {
  const values = {}

  for (
    const rawLine
    of text.split(/\r?\n/)
  ) {
    let line =
      rawLine.trim()

    if (
      !line ||
      line.startsWith('#')
    ) {
      continue
    }

    if (
      line.startsWith(
        'export ',
      )
    ) {
      line =
        line
          .slice(7)
          .trim()
    }

    const equals =
      line.indexOf('=')

    if (
      equals <= 0
    ) {
      continue
    }

    const key =
      line
        .slice(
          0,
          equals,
        )
        .trim()

    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(
        key,
      )
    ) {
      continue
    }

    let value =
      line
        .slice(
          equals + 1,
        )
        .trim()

    if (
      value.length >= 2 &&
      (
        (
          value.startsWith('"') &&
          value.endsWith('"')
        ) ||
        (
          value.startsWith("'") &&
          value.endsWith("'")
        )
      )
    ) {
      const quote =
        value[0]

      value =
        value.slice(
          1,
          -1,
        )

      if (
        quote === '"'
      ) {
        value =
          value
            .replaceAll(
              '\\n',
              '\n',
            )
            .replaceAll(
              '\\r',
              '\r',
            )
      }
    } else {
      const comment =
        value.search(
          /\s+#/,
        )

      if (
        comment >= 0
      ) {
        value =
          value
            .slice(
              0,
              comment,
            )
            .trim()
      }
    }

    values[key] =
      value
  }

  return values
}

function readProjectEnv(
  root,
) {
  const values = {}

  const files = [
    '.env',
    '.env.local',
    '.env.development',
    '.env.development.local',
  ]

  for (
    const file
    of files
  ) {
    const filename =
      path.join(
        root,
        file,
      )

    if (
      !existsSync(
        filename,
      )
    ) {
      continue
    }

    Object.assign(
      values,
      parseEnvText(
        readFileSync(
          filename,
          'utf8',
        ),
      ),
    )
  }

  return values
}

export function resolveSupabaseConfig(
  root,
) {
  const fileEnv =
    readProjectEnv(
      root,
    )

  const url =
    process.env.VITE_SUPABASE_URL ??
    fileEnv.VITE_SUPABASE_URL

  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY

  if (
    !url ||
    !key?.startsWith(
      'sb_publishable_',
    )
  ) {
    throw new Error(
      'AR proof requires VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
    )
  }

  let parsed

  try {
    parsed =
      new URL(url)
  } catch {
    throw new Error(
      'AR proof Supabase URL is invalid.',
    )
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      'AR proof Supabase URL must use HTTPS without credentials.',
    )
  }

  return {
    url:
      parsed.origin,

    key,
  }
}

export function validateSelection(
  input,
) {
  if (
    !safeId(
      input?.artworkId,
    )
  ) {
    throw new Error(
      'Provide a valid artworkId.',
    )
  }

  if (
    input.imageId !== undefined &&
    input.imageId !== null &&
    !safeImageId(
      input.imageId,
    )
  ) {
    throw new Error(
      'imageId must be a valid artwork image identifier.',
    )
  }

  return input.imageId
    ? {
        artworkId:
          input.artworkId,

        imageId:
          input.imageId,
      }
    : {
        artworkId:
          input.artworkId,
      }
}

function imageOrder(
  image,
) {
  return Number.isFinite(
    image?.order,
  )
    ? image.order
    : Number.isFinite(
          image?.position,
        )
      ? image.position
      : Number.MAX_SAFE_INTEGER
}

function chooseImage(
  artwork,
  requestedImageId,
) {
  if (
    typeof artwork?.seller_id !==
    'string'
  ) {
    throw new Error(
      'Published artwork has no valid seller.',
    )
  }

  const images =
    Array.isArray(
      artwork.images,
    )
      ? artwork.images
          .filter(
            (entry) =>
              entry &&
              typeof entry ===
                'object' &&
              safeImageId(
                entry.id,
              ),
          )
          .sort(
            (
              a,
              b,
            ) =>
              imageOrder(a) -
              imageOrder(b),
          )
      : []

  const image =
    requestedImageId
      ? images.find(
          (entry) =>
            entry.id ===
            requestedImageId,
        )
      : images[0]

  if (!image) {
    throw new Error(
      'Published artwork has no usable image.',
    )
  }

  const expectedPath =
    `${artwork.seller_id}/${artwork.id}/${image.id}`

  if (
    image.path !==
      expectedPath ||
    !ALLOWED_IMAGE_TYPES.has(
      image.contentType,
    )
  ) {
    throw new Error(
      'Selected image is missing or does not belong to this published artwork.',
    )
  }

  return {
    id:
      image.id,

    path:
      expectedPath,

    contentType:
      image.contentType,
  }
}

export function estimateDisplaySize(
  pixelWidth,
  pixelHeight,
) {
  if (
    !Number.isSafeInteger(
      pixelWidth,
    ) ||
    !Number.isSafeInteger(
      pixelHeight,
    ) ||
    pixelWidth <= 0 ||
    pixelHeight <= 0
  ) {
    throw new Error(
      'Valid source image dimensions are required.',
    )
  }

  const ratio =
    pixelWidth /
    pixelHeight

  let artworkWidthMm
  let artworkHeightMm

  if (
    ratio >= 2
  ) {
    artworkWidthMm =
      1000

    artworkHeightMm =
      artworkWidthMm /
      ratio
  } else if (
    ratio <= 0.5
  ) {
    artworkHeightMm =
      1000

    artworkWidthMm =
      artworkHeightMm *
      ratio
  } else if (
    ratio > 1.15
  ) {
    artworkWidthMm =
      800

    artworkHeightMm =
      artworkWidthMm /
      ratio
  } else if (
    ratio < 0.87
  ) {
    artworkHeightMm =
      700

    artworkWidthMm =
      artworkHeightMm *
      ratio
  } else if (
    ratio >= 1
  ) {
    artworkWidthMm =
      650

    artworkHeightMm =
      artworkWidthMm /
      ratio
  } else {
    artworkHeightMm =
      650

    artworkWidthMm =
      artworkHeightMm *
      ratio
  }

  artworkWidthMm =
    round1(
      artworkWidthMm,
    )

  artworkHeightMm =
    round1(
      artworkHeightMm,
    )

  return {
    sizingMode:
      SIZING_MODE,

    artworkWidthMm,
    artworkHeightMm,

    frameMm:
      FRAME_MM,

    widthMm:
      round1(
        artworkWidthMm +
          FRAME_MM * 2,
      ),

    heightMm:
      round1(
        artworkHeightMm +
          FRAME_MM * 2,
      ),

    includesFrame:
      true,
  }
}

function isRetryableHttpStatus(
  status,
) {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (
      status >= 500 &&
      status <= 599
    )
  )
}

function isRetryableDownloadError(
  error,
) {
  if (
    !(error instanceof Error)
  ) {
    return false
  }

  if (
    error.name ===
      'TimeoutError' ||
    error.name ===
      'AbortError'
  ) {
    return true
  }

  if (
    error instanceof TypeError
  ) {
    return true
  }

  return /timeout|timed out|network|fetch failed|socket|connection/i
    .test(
      error.message,
    )
}

async function readLimitedResponseBody(
  response,
) {
  const contentLength =
    response.headers
      ?.get?.(
        'content-length',
      )

  if (
    contentLength
  ) {
    const declaredBytes =
      Number(
        contentLength,
      )

    if (
      Number.isFinite(
        declaredBytes,
      ) &&
      declaredBytes >
        MAX_SOURCE_BYTES
    ) {
      throw new Error(
        'Source image exceeds 10 MB.',
      )
    }
  }

  if (
    !response.body
  ) {
    throw new Error(
      'Selected published artwork image could not be downloaded.',
    )
  }

  const chunks = []
  let size = 0

  for await (
    const chunk
    of response.body
  ) {
    const bytes =
      Buffer.from(
        chunk,
      )

    size +=
      bytes.length

    if (
      size >
      MAX_SOURCE_BYTES
    ) {
      throw new Error(
        'Source image exceeds 10 MB.',
      )
    }

    chunks.push(
      bytes,
    )
  }

  const bytes =
    Buffer.concat(
      chunks,
    )

  if (
    !bytes.length
  ) {
    throw new Error(
      'Source image is empty.',
    )
  }

  return bytes
}

export function createSupabaseSource(
  root,
  fetcher = fetch,
) {
  const {
    url,
    key,
  } =
    resolveSupabaseConfig(
      root,
    )

  const client =
    createClient(
      url,
      key,
      {
        auth: {
          persistSession:
            false,

          autoRefreshToken:
            false,

          detectSessionInUrl:
            false,
        },

        global: {
          fetch:
            fetcher,
        },
      },
    )

  return {
    async getPublishedArtwork(
      artworkId,
    ) {
      const {
        data,
        error,
      } =
        await client
          .from(
            'artwork_catalog',
          )
          .select(
            'id,seller_id,status,images',
          )
          .eq(
            'id',
            artworkId,
          )
          .eq(
            'status',
            'PUBLISHED',
          )
          .maybeSingle()

      if (
        error
      ) {
        throw new Error(
          'Published artwork could not be read from Supabase.',
        )
      }

      return data
    },

    async listPublishedArtworkIds() {
      const {
        data,
        error,
      } =
        await client
          .from(
            'artwork_catalog',
          )
          .select(
            'id',
          )
          .eq(
            'status',
            'PUBLISHED',
          )

      if (
        error
      ) {
        throw new Error(
          'Published artwork list could not be read from Supabase.',
        )
      }

      return (
        data ?? []
      )
        .map(
          (row) =>
            row?.id,
        )
        .filter(
          safeId,
        )
    },

    async downloadImage(
      objectPath,
    ) {
      let finalError =
        null

      for (
        let attempt = 0;
        attempt <
          DOWNLOAD_ATTEMPTS;
        attempt += 1
      ) {
        const delay =
          DOWNLOAD_RETRY_DELAYS_MS[
            attempt
          ] ?? 0

        await sleep(
          delay,
        )

        const {
          data,
          error,
        } =
          await client.storage
            .from(
              ARTWORK_IMAGE_BUCKET,
            )
            .createSignedUrl(
              objectPath,
              SIGNED_URL_TTL_SECONDS,
            )

        if (
          error ||
          !data?.signedUrl
        ) {
          throw new Error(
            'Selected published artwork image could not be signed.',
          )
        }

        try {
          const response =
            await fetcher(
              data.signedUrl,
              {
                signal:
                  AbortSignal.timeout(
                    DOWNLOAD_TIMEOUT_MS,
                  ),

                redirect:
                  'error',
              },
            )

          if (
            !response.ok
          ) {
            if (
              attempt + 1 <
                DOWNLOAD_ATTEMPTS &&
              isRetryableHttpStatus(
                response.status,
              )
            ) {
              finalError =
                new Error(
                  `Temporary storage response ${response.status}.`,
                )

              continue
            }

            throw new Error(
              'Selected published artwork image could not be downloaded.',
            )
          }

          return await readLimitedResponseBody(
            response,
          )
        } catch (
          error
        ) {
          if (
            error instanceof Error &&
            (
              error.message ===
                'Source image exceeds 10 MB.' ||
              error.message ===
                'Source image is empty.'
            )
          ) {
            throw error
          }

          finalError =
            error

          if (
            attempt + 1 >=
              DOWNLOAD_ATTEMPTS ||
            !isRetryableDownloadError(
              error,
            )
          ) {
            throw new Error(
              'Selected published artwork image could not be downloaded.',
            )
          }
        }
      }

      throw new Error(
        finalError instanceof Error
          ? 'Selected published artwork image could not be downloaded after retrying.'
          : 'Selected published artwork image could not be downloaded.',
      )
    },
  }
}

export async function readPublishedSource(
  selection,
  source,
) {
  const request =
    validateSelection(
      selection,
    )

  if (
    !source ||
    typeof source
      .getPublishedArtwork !==
      'function' ||
    typeof source
      .downloadImage !==
      'function'
  ) {
    throw new Error(
      'A Supabase artwork source is required.',
    )
  }

  const artwork =
    await source
      .getPublishedArtwork(
        request.artworkId,
      )

  if (
    !artwork ||
    artwork.status !==
      'PUBLISHED'
  ) {
    throw new Error(
      'Only PUBLISHED artwork can be used for this proof.',
    )
  }

  const image =
    chooseImage(
      artwork,
      request.imageId,
    )

  const downloaded =
    await source
      .downloadImage(
        image.path,
      )

  const bytes =
    Buffer.isBuffer(
      downloaded,
    )
      ? downloaded
      : Buffer.from(
          downloaded,
        )

  if (
    !bytes.length
  ) {
    throw new Error(
      'Source image is empty.',
    )
  }

  if (
    bytes.length >
    MAX_SOURCE_BYTES
  ) {
    throw new Error(
      'Source image exceeds 10 MB.',
    )
  }

  return {
    artworkId:
      artwork.id,

    imageId:
      image.id,

    imagePath:
      image.path,

    sourceSha256:
      sha256(
        bytes,
      ),

    bytes,
  }
}

let sharpModule =
  null

async function loadSharp() {
  if (
    !sharpModule
  ) {
    const module =
      await import(
        'sharp',
      )

    sharpModule =
      module.default
  }

  return sharpModule
}

export async function inspectSourceImage(
  sourceBytes,
) {
  const bytes =
    Buffer.isBuffer(
      sourceBytes,
    )
      ? sourceBytes
      : Buffer.from(
          sourceBytes ??
            [],
        )

  if (
    !bytes.length
  ) {
    throw new Error(
      'Source image is empty.',
    )
  }

  if (
    bytes.length >
    MAX_SOURCE_BYTES
  ) {
    throw new Error(
      'Source image exceeds 10 MB.',
    )
  }

  const sharp =
    await loadSharp()

  let metadata

  try {
    metadata =
      await sharp(
        bytes,
        {
          failOn:
            'warning',

          limitInputPixels:
            MAX_SOURCE_PIXELS,

          limitInputChannels:
            MAX_INPUT_CHANNELS,

          sequentialRead:
            true,
        },
      ).metadata()
  } catch (
    error
  ) {
    if (
      error instanceof Error &&
      /pixel limit|input image exceeds pixel limit/i
        .test(
          error.message,
        )
    ) {
      throw new Error(
        'Source image exceeds the 100 megapixel AR safety limit.',
      )
    }

    throw new Error(
      'Source image metadata could not be read safely.',
    )
  }

  if (
    ![
      'jpeg',
      'png',
      'webp',
    ].includes(
      metadata.format,
    )
  ) {
    throw new Error(
      'Source image format is not supported for AR.',
    )
  }

  if (
    Number.isSafeInteger(
      metadata.pages,
    ) &&
    metadata.pages > 1
  ) {
    throw new Error(
      'Animated or multi-page artwork images are not supported for AR.',
    )
  }

  const oriented =
    metadata.autoOrient

  const width =
    oriented?.width ??
    metadata.width

  const height =
    oriented?.height ??
    metadata.height

  if (
    !Number.isSafeInteger(
      width,
    ) ||
    !Number.isSafeInteger(
      height,
    ) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(
      'The artwork image dimensions could not be determined.',
    )
  }

  if (
    width >
      MAX_SOURCE_EDGE_PIXELS ||
    height >
      MAX_SOURCE_EDGE_PIXELS
  ) {
    throw new Error(
      'Source image exceeds the 16384 pixel AR edge safety limit.',
    )
  }

  const pixels =
    width *
    height

  if (
    !Number.isSafeInteger(
      pixels,
    ) ||
    pixels >
      MAX_SOURCE_PIXELS
  ) {
    throw new Error(
      'Source image exceeds the 100 megapixel AR safety limit.',
    )
  }

  return {
    width,
    height,
    pixels,

    format:
      metadata.format,
  }
}

function texturePixelGeometry(
  geometry,
) {
  const scale =
    Math.min(
      MAX_TEXTURE_EDGE_PIXELS /
        geometry.widthMm,

      MAX_TEXTURE_EDGE_PIXELS /
        geometry.heightMm,
    )

  return {
    framePixels:
      Math.max(
        2,
        Math.round(
          geometry.frameMm *
            scale,
        ),
      ),

    artworkWidthPixels:
      Math.max(
        1,
        Math.round(
          geometry
            .artworkWidthMm *
            scale,
        ),
      ),

    artworkHeightPixels:
      Math.max(
        1,
        Math.round(
          geometry
            .artworkHeightMm *
            scale,
        ),
      ),
  }
}

async function buildArtworkJpeg(
  sourceBytes,
  geometry,
) {
  const sharp =
    await loadSharp()

  const {
    artworkWidthPixels,
    artworkHeightPixels,
  } =
    texturePixelGeometry(
      geometry,
    )

  return sharp(
    sourceBytes,
    {
      failOn:
        'warning',

      limitInputPixels:
        MAX_SOURCE_PIXELS,

      limitInputChannels:
        MAX_INPUT_CHANNELS,

      sequentialRead:
        true,
    },
  )
    .autoOrient()
    .resize({
      width:
        artworkWidthPixels,

      height:
        artworkHeightPixels,

      fit:
        'fill',
    })
    .flatten({
      background:
        '#ffffff',
    })
    .jpeg({
      quality:
        88,

      chromaSubsampling:
        '4:4:4',
    })
    .toBuffer()
}

async function applyFrameToArtworkJpeg(
  artworkJpeg,
  geometry,
  frameStyle,
) {
  if (
    !isFrameStyle(
      frameStyle,
    )
  ) {
    throw new Error(
      'Unknown AR frame style.',
    )
  }

  const sharp =
    await loadSharp()

  const {
    framePixels,
  } =
    texturePixelGeometry(
      geometry,
    )

  const frame =
    FRAME_STYLES[
      frameStyle
    ]

  return sharp(
    artworkJpeg,
    {
      failOn:
        'warning',

      limitInputPixels:
        MAX_SOURCE_PIXELS,

      limitInputChannels:
        MAX_INPUT_CHANNELS,

      sequentialRead:
        true,
    },
  )
    .extend({
      top:
        framePixels,

      bottom:
        framePixels,

      left:
        framePixels,

      right:
        framePixels,

      background:
        frame.color,
    })
    .jpeg({
      quality:
        88,

      chromaSubsampling:
        '4:4:4',
    })
    .toBuffer()
}

export async function buildFramedJpeg(
  sourceBytes,
  geometry,
  frameStyle =
    DEFAULT_FRAME_STYLE,
) {
  const artworkJpeg =
    await buildArtworkJpeg(
      sourceBytes,
      geometry,
    )

  return applyFrameToArtworkJpeg(
    artworkJpeg,
    geometry,
    frameStyle,
  )
}

function frameMaterial(
  frameStyle,
) {
  const frame =
    FRAME_STYLES[
      frameStyle
    ] ??
    FRAME_STYLES[
      DEFAULT_FRAME_STYLE
    ]

  return {
    baseColorFactor: [
      frame.color.r / 255,
      frame.color.g / 255,
      frame.color.b / 255,
      1,
    ],

    metallicFactor:
      frame.metallicFactor,

    roughnessFactor:
      frame.roughnessFactor,
  }
}

function createBackingGeometry(
  halfWidth,
  halfHeight,
  frontZ,
  backZ,
) {
  /*
   * 24 vertices:
   * 4 for each face.
   *
   * Separate vertices per face give
   * every face a correct flat normal.
   */

  const positions =
    new Float32Array([
      // Front
      -halfWidth, -halfHeight, frontZ,
      halfWidth, -halfHeight, frontZ,
      halfWidth, halfHeight, frontZ,
      -halfWidth, halfHeight, frontZ,

      // Back
      halfWidth, -halfHeight, backZ,
      -halfWidth, -halfHeight, backZ,
      -halfWidth, halfHeight, backZ,
      halfWidth, halfHeight, backZ,

      // Left
      -halfWidth, -halfHeight, backZ,
      -halfWidth, -halfHeight, frontZ,
      -halfWidth, halfHeight, frontZ,
      -halfWidth, halfHeight, backZ,

      // Right
      halfWidth, -halfHeight, frontZ,
      halfWidth, -halfHeight, backZ,
      halfWidth, halfHeight, backZ,
      halfWidth, halfHeight, frontZ,

      // Top
      -halfWidth, halfHeight, frontZ,
      halfWidth, halfHeight, frontZ,
      halfWidth, halfHeight, backZ,
      -halfWidth, halfHeight, backZ,

      // Bottom
      -halfWidth, -halfHeight, backZ,
      halfWidth, -halfHeight, backZ,
      halfWidth, -halfHeight, frontZ,
      -halfWidth, -halfHeight, frontZ,
    ])

  const normals =
    new Float32Array([
      // Front
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,

      // Back
      0, 0, -1,
      0, 0, -1,
      0, 0, -1,
      0, 0, -1,

      // Left
      -1, 0, 0,
      -1, 0, 0,
      -1, 0, 0,
      -1, 0, 0,

      // Right
      1, 0, 0,
      1, 0, 0,
      1, 0, 0,
      1, 0, 0,

      // Top
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,

      // Bottom
      0, -1, 0,
      0, -1, 0,
      0, -1, 0,
      0, -1, 0,
    ])

  const indices =
    new Uint16Array([
      0, 1, 2,
      0, 2, 3,

      4, 5, 6,
      4, 6, 7,

      8, 9, 10,
      8, 10, 11,

      12, 13, 14,
      12, 14, 15,

      16, 17, 18,
      16, 18, 19,

      20, 21, 22,
      20, 22, 23,
    ])

  return {
    positions,
    normals,
    indices,
  }
}

/*
 * Legacy function name retained so the
 * existing script tests/API do not need
 * a breaking rename.
 *
 * The model is no longer mathematically
 * flat: it now includes a shallow solid
 * backing/profile behind the textured
 * artwork plane.
 */
export function buildFlatGlb(
  jpeg,
  widthMm,
  heightMm,
  frameStyle =
    DEFAULT_FRAME_STYLE,
) {
  if (
    ![
      widthMm,
      heightMm,
    ].every(
      (value) =>
        Number.isFinite(
          value,
        ) &&
        value > 0 &&
        value <=
          10000,
    )
  ) {
    throw new Error(
      'Invalid AR display dimensions.',
    )
  }

  if (
    !isFrameStyle(
      frameStyle,
    )
  ) {
    throw new Error(
      'Unknown AR frame style.',
    )
  }

  const w =
    Math.fround(
      widthMm /
        2000,
    )

  const h =
    Math.fround(
      heightMm /
        2000,
    )

  const frontOffset =
    Math.fround(
      FRONT_OFFSET_MM /
        1000,
    )

  const depth =
    Math.fround(
      FRAME_DEPTH_MM /
        1000,
    )

  /*
   * Keep the textured front slightly in
   * front of the solid backing surface.
   */
  const positions =
    new Float32Array([
      -w, -h, frontOffset,
      w, -h, frontOffset,
      w, h, frontOffset,
      -w, h, frontOffset,
    ])

  const normals =
    new Float32Array([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
    ])

  const uv =
    new Float32Array([
      0, 1,
      1, 1,
      1, 0,
      0, 0,
    ])

  const indices =
    new Uint16Array([
      0, 1, 2,
      0, 2, 3,
    ])

  const backing =
    createBackingGeometry(
      w,
      h,
      0,
      -depth,
    )

  /*
   * Keep the original first four buffer
   * views in the same order. Existing
   * tests and tooling therefore continue
   * to inspect the front plane exactly as
   * before.
   */
  const buffers = [
    Buffer.from(
      positions.buffer,
    ),

    Buffer.from(
      normals.buffer,
    ),

    Buffer.from(
      uv.buffer,
    ),

    Buffer.from(
      indices.buffer,
    ),

    Buffer.from(
      backing.positions.buffer,
    ),

    Buffer.from(
      backing.normals.buffer,
    ),

    Buffer.from(
      backing.indices.buffer,
    ),

    jpeg,
  ]

  let offset = 0

  const views =
    buffers.map(
      (buffer) => {
        const view = {
          buffer: 0,

          byteOffset:
            offset,

          byteLength:
            buffer.length,
        }

        offset +=
          buffer.length

        return view
      },
    )

  const binary =
    Buffer.concat([
      ...buffers,

      Buffer.alloc(
        (
          4 -
          (
            offset %
            4
          )
        ) %
          4,
      ),
    ])

  const solidMaterial =
    frameMaterial(
      frameStyle,
    )

  const gltf = {
    asset: {
      version:
        '2.0',

      generator:
        `ArtVault framed-wall AR proof ${GENERATOR_VERSION}`,
    },

    scene:
      0,

    scenes: [
      {
        nodes: [
          0,
        ],
      },
    ],

    nodes: [
      {
        mesh:
          0,
      },
    ],

    meshes: [
      {
        primitives: [
          /*
           * Front artwork + visible
           * 30 mm frame texture.
           */
          {
            attributes: {
              POSITION:
                0,

              NORMAL:
                1,

              TEXCOORD_0:
                2,
            },

            indices:
              3,

            material:
              0,
          },

          /*
           * Physical shallow backing
           * and visible side profile.
           */
          {
            attributes: {
              POSITION:
                4,

              NORMAL:
                5,
            },

            indices:
              6,

            material:
              1,
          },
        ],
      },
    ],

    materials: [
      {
        pbrMetallicRoughness: {
          baseColorTexture: {
            index:
              0,
          },

          metallicFactor:
            0,

          roughnessFactor:
            1,
        },

        /*
         * Preserve the physical Android
         * visibility fix from the
         * previously working proof.
         */
        doubleSided:
          true,
      },

      {
        pbrMetallicRoughness: {
          baseColorFactor:
            solidMaterial
              .baseColorFactor,

          metallicFactor:
            solidMaterial
              .metallicFactor,

          roughnessFactor:
            solidMaterial
              .roughnessFactor,
        },

        doubleSided:
          true,
      },
    ],

    textures: [
      {
        source:
          0,

        sampler:
          0,
      },
    ],

    samplers: [
      {
        wrapS:
          33071,

        wrapT:
          33071,

        magFilter:
          9729,

        minFilter:
          9987,
      },
    ],

    images: [
      {
        bufferView:
          7,

        mimeType:
          'image/jpeg',
      },
    ],

    bufferViews:
      views,

    buffers: [
      {
        byteLength:
          binary.length,
      },
    ],

    accessors: [
      /*
       * Existing front-plane
       * accessors remain 0-3.
       */
      {
        bufferView:
          0,

        componentType:
          5126,

        count:
          4,

        type:
          'VEC3',

        min: [
          -w,
          -h,
          frontOffset,
        ],

        max: [
          w,
          h,
          frontOffset,
        ],
      },

      {
        bufferView:
          1,

        componentType:
          5126,

        count:
          4,

        type:
          'VEC3',
      },

      {
        bufferView:
          2,

        componentType:
          5126,

        count:
          4,

        type:
          'VEC2',
      },

      {
        bufferView:
          3,

        componentType:
          5123,

        count:
          6,

        type:
          'SCALAR',
      },

      /*
       * Solid backing/profile.
       */
      {
        bufferView:
          4,

        componentType:
          5126,

        count:
          24,

        type:
          'VEC3',

        min: [
          -w,
          -h,
          -depth,
        ],

        max: [
          w,
          h,
          0,
        ],
      },

      {
        bufferView:
          5,

        componentType:
          5126,

        count:
          24,

        type:
          'VEC3',
      },

      {
        bufferView:
          6,

        componentType:
          5123,

        count:
          36,

        type:
          'SCALAR',
      },
    ],
  }

  let json =
    Buffer.from(
      JSON.stringify(
        gltf,
      ),
    )

  json =
    Buffer.concat([
      json,

      Buffer.alloc(
        (
          4 -
          (
            json.length %
            4
          )
        ) %
          4,
        32,
      ),
    ])

  const header =
    Buffer.alloc(
      20,
    )

  header.writeUInt32LE(
    0x46546c67,
  )

  header.writeUInt32LE(
    2,
    4,
  )

  header.writeUInt32LE(
    28 +
      json.length +
      binary.length,
    8,
  )

  header.writeUInt32LE(
    json.length,
    12,
  )

  header.writeUInt32LE(
    0x4e4f534a,
    16,
  )

  const binHeader =
    Buffer.alloc(
      8,
    )

  binHeader.writeUInt32LE(
    binary.length,
  )

  binHeader.writeUInt32LE(
    0x004e4942,
    4,
  )

  return Buffer.concat([
    header,
    json,
    binHeader,
    binary,
  ])
}

function artworkDirectory(
  root,
  artworkId,
) {
  return path.join(
    root,
    PROOF_DIRECTORY,
    artworkId,
  )
}

function manifestFilename(
  root,
  artworkId,
) {
  return path.join(
    artworkDirectory(
      root,
      artworkId,
    ),
    'manifest.json',
  )
}

function modelFilename(
  root,
  artworkId,
  version,
) {
  return path.join(
    artworkDirectory(
      root,
      artworkId,
    ),
    `${version}.glb`,
  )
}

function validDimension(
  value,
) {
  return (
    Number.isFinite(
      value,
    ) &&
    value > 0 &&
    value <=
      10000
  )
}

function validateFrameManifest(
  frames,
) {
  if (
    !frames ||
    typeof frames !==
      'object'
  ) {
    throw new Error(
      'Invalid AR frame variants.',
    )
  }

  for (
    const frameStyle
    of FRAME_STYLE_KEYS
  ) {
    const variant =
      frames[
        frameStyle
      ]

    const expectedLabel =
      FRAME_STYLES[
        frameStyle
      ].label

    if (
      !variant ||
      typeof variant !==
        'object' ||
      variant.label !==
        expectedLabel ||
      !/^[a-f0-9]{64}$/.test(
        variant.version,
      ) ||
      !Number.isSafeInteger(
        variant.bytes,
      ) ||
      variant.bytes <= 0 ||
      variant.bytes >
        MAX_MODEL_BYTES
    ) {
      throw new Error(
        'Invalid AR frame variant.',
      )
    }
  }

  return frames
}

function validateManifest(
  manifest,
  artworkId,
) {
  if (
    !manifest ||
    typeof manifest !==
      'object' ||
    manifest.schemaVersion !==
      SCHEMA_VERSION ||
    manifest.generatorVersion !==
      GENERATOR_VERSION ||
    manifest.artworkId !==
      artworkId ||
    !safeImageId(
      manifest.imageId,
    ) ||
    manifest.sizingMode !==
      SIZING_MODE ||
    manifest.includesFrame !==
      true ||
    manifest.frameMm !==
      FRAME_MM ||
    manifest.frameDepthMm !==
      FRAME_DEPTH_MM ||
    !validDimension(
      manifest.artworkWidthMm,
    ) ||
    !validDimension(
      manifest.artworkHeightMm,
    ) ||
    !validDimension(
      manifest.widthMm,
    ) ||
    !validDimension(
      manifest.heightMm,
    ) ||
    typeof manifest.imagePath !==
      'string' ||
    !Number.isSafeInteger(
      manifest.sourceWidthPixels,
    ) ||
    manifest.sourceWidthPixels <=
      0 ||
    manifest.sourceWidthPixels >
      MAX_SOURCE_EDGE_PIXELS ||
    !Number.isSafeInteger(
      manifest.sourceHeightPixels,
    ) ||
    manifest.sourceHeightPixels <=
      0 ||
    manifest.sourceHeightPixels >
      MAX_SOURCE_EDGE_PIXELS ||
    !Number.isSafeInteger(
      manifest.sourcePixels,
    ) ||
    manifest.sourcePixels <=
      0 ||
    manifest.sourcePixels >
      MAX_SOURCE_PIXELS ||
    manifest.sourcePixels !==
      manifest.sourceWidthPixels *
        manifest.sourceHeightPixels ||
    !/^[a-f0-9]{64}$/.test(
      manifest.sourceSha256,
    ) ||
    manifest.defaultFrame !==
      DEFAULT_FRAME_STYLE ||
    !/^[a-f0-9]{64}$/.test(
      manifest.version,
    ) ||
    !Number.isSafeInteger(
      manifest.bytes,
    ) ||
    manifest.bytes <=
      0 ||
    manifest.bytes >
      MAX_MODEL_BYTES
  ) {
    throw new Error(
      'Invalid AR proof manifest.',
    )
  }

  const frames =
    validateFrameManifest(
      manifest.frames,
    )

  const defaultVariant =
    frames[
      DEFAULT_FRAME_STYLE
    ]

  if (
    manifest.version !==
      defaultVariant.version ||
    manifest.bytes !==
      defaultVariant.bytes
  ) {
    throw new Error(
      'Invalid default AR frame variant.',
    )
  }

  return manifest
}

function publicProof(
  manifest,
) {
  const frames = {}

  for (
    const frameStyle
    of FRAME_STYLE_KEYS
  ) {
    const variant =
      manifest.frames[
        frameStyle
      ]

    frames[
      frameStyle
    ] = {
      label:
        variant.label,

      modelUrl:
        `${PROOF_PREFIX}model/${manifest.artworkId}/${variant.version}.glb`,

      version:
        variant.version,
    }
  }

  const defaultVariant =
    frames[
      manifest.defaultFrame
    ]

  return {
    artworkId:
      manifest.artworkId,

    imageId:
      manifest.imageId,

    sizingMode:
      manifest.sizingMode,

    artworkWidthMm:
      manifest.artworkWidthMm,

    artworkHeightMm:
      manifest.artworkHeightMm,

    frameMm:
      manifest.frameMm,

    widthMm:
      manifest.widthMm,

    heightMm:
      manifest.heightMm,

    includesFrame:
      true,

    defaultFrame:
      manifest.defaultFrame,

    frames,

    modelUrl:
      defaultVariant.modelUrl,

    version:
      defaultVariant.version,
  }
}

async function readLocalManifest(
  root,
  artworkId,
) {
  const manifest =
    JSON.parse(
      await readFile(
        manifestFilename(
          root,
          artworkId,
        ),
        'utf8',
      ),
    )

  return validateManifest(
    manifest,
    artworkId,
  )
}

async function removeOldModels(
  directory,
  keepVersions,
) {
  let entries = []

  try {
    entries =
      await readdir(
        directory,
      )
  } catch {
    return
  }

  const keep =
    new Set(
      keepVersions,
    )

  await Promise.all(
    entries
      .filter(
        (name) =>
          /^[a-f0-9]{64}\.glb$/.test(
            name,
          ) &&
          !keep.has(
            name.slice(
              0,
              -4,
            ),
          ),
      )
      .map(
        (name) =>
          rm(
            path.join(
              directory,
              name,
            ),
            {
              force:
                true,
            },
          ),
      ),
  )
}

async function generateFromPublished(
  root,
  published,
) {
  const sourceImage =
    await inspectSourceImage(
      published.bytes,
    )

  const geometry =
    estimateDisplaySize(
      sourceImage.width,
      sourceImage.height,
    )

  /*
   * Resize the seller artwork once.
   * Frame variants are created from
   * the already-normalized texture.
   */
  const artworkJpeg =
    await buildArtworkJpeg(
      published.bytes,
      geometry,
    )

  const generatedFrames =
    {}

  for (
    const frameStyle
    of FRAME_STYLE_KEYS
  ) {
    const jpeg =
      await applyFrameToArtworkJpeg(
        artworkJpeg,
        geometry,
        frameStyle,
      )

    const glb =
      buildFlatGlb(
        jpeg,
        geometry.widthMm,
        geometry.heightMm,
        frameStyle,
      )

    if (
      glb.length >
      MAX_MODEL_BYTES
    ) {
      throw new Error(
        `Generated ${FRAME_STYLES[frameStyle].label} frame GLB exceeds the 5 MB proof budget.`,
      )
    }

    generatedFrames[
      frameStyle
    ] = {
      label:
        FRAME_STYLES[
          frameStyle
        ].label,

      version:
        sha256(
          glb,
        ),

      bytes:
        glb.length,

      glb,
    }
  }

  const defaultVariant =
    generatedFrames[
      DEFAULT_FRAME_STYLE
    ]

  const manifestFrames =
    Object.fromEntries(
      FRAME_STYLE_KEYS.map(
        (
          frameStyle,
        ) => {
          const variant =
            generatedFrames[
              frameStyle
            ]

          return [
            frameStyle,
            {
              label:
                variant.label,

              version:
                variant.version,

              bytes:
                variant.bytes,
            },
          ]
        },
      ),
    )

  const manifest = {
    schemaVersion:
      SCHEMA_VERSION,

    generatorVersion:
      GENERATOR_VERSION,

    artworkId:
      published.artworkId,

    imageId:
      published.imageId,

    ...geometry,

    frameDepthMm:
      FRAME_DEPTH_MM,

    imagePath:
      published.imagePath,

    sourceWidthPixels:
      sourceImage.width,

    sourceHeightPixels:
      sourceImage.height,

    sourcePixels:
      sourceImage.pixels,

    sourceSha256:
      published.sourceSha256,

    defaultFrame:
      DEFAULT_FRAME_STYLE,

    frames:
      manifestFrames,

    version:
      defaultVariant.version,

    bytes:
      defaultVariant.bytes,
  }

  const directory =
    artworkDirectory(
      root,
      published.artworkId,
    )

  await mkdir(
    directory,
    {
      recursive:
        true,
    },
  )

  for (
    const frameStyle
    of FRAME_STYLE_KEYS
  ) {
    const variant =
      generatedFrames[
        frameStyle
      ]

    await writeFile(
      modelFilename(
        root,
        published.artworkId,
        variant.version,
      ),
      variant.glb,
    )
  }

  const temporary =
    path.join(
      directory,
      'manifest.tmp',
    )

  await writeFile(
    temporary,
    `${JSON.stringify(
      manifest,
      null,
      2,
    )}\n`,
  )

  await rename(
    temporary,
    manifestFilename(
      root,
      published.artworkId,
    ),
  )

  await removeOldModels(
    directory,

    FRAME_STYLE_KEYS.map(
      (
        frameStyle,
      ) =>
        generatedFrames[
          frameStyle
        ].version,
    ),
  )

  return manifest
}

export async function generateProof(
  root,
  input,
  suppliedSource,
) {
  const selection =
    validateSelection(
      input,
    )

  const source =
    suppliedSource ??
    createSupabaseSource(
      root,
    )

  const published =
    await readPublishedSource(
      selection,
      source,
    )

  return generateFromPublished(
    root,
    published,
  )
}

async function manifestModelsAreValid(
  root,
  artworkId,
  manifest,
) {
  for (
    const frameStyle
    of FRAME_STYLE_KEYS
  ) {
    const variant =
      manifest.frames[
        frameStyle
      ]

    const model =
      await readFile(
        modelFilename(
          root,
          artworkId,
          variant.version,
        ),
      )

    if (
      sha256(
        model,
      ) !==
      variant.version
    ) {
      return false
    }
  }

  return true
}

export async function ensureProof(
  root,
  artworkId,
  suppliedSource,
) {
  if (
    !safeId(
      artworkId,
    )
  ) {
    throw new Error(
      'Invalid artwork id.',
    )
  }

  const existingLock =
    proofLocks.get(
      artworkId,
    )

  if (
    existingLock
  ) {
    return existingLock
  }

  const task =
    (
      async () => {
        const source =
          suppliedSource ??
          createSupabaseSource(
            root,
          )

        const current =
          await readPublishedSource(
            {
              artworkId,
            },
            source,
          )

        try {
          const manifest =
            await readLocalManifest(
              root,
              artworkId,
            )

          if (
            manifest.imageId ===
              current.imageId &&
            manifest.imagePath ===
              current.imagePath &&
            manifest.sourceSha256 ===
              current.sourceSha256 &&
            await manifestModelsAreValid(
              root,
              artworkId,
              manifest,
            )
          ) {
            return manifest
          }
        } catch {
          /*
           * Missing, stale,
           * old-schema,
           * incomplete,
           * or corrupt proof:
           * regenerate below.
           */
        }

        return generateFromPublished(
          root,
          current,
        )
      }
    )()

  proofLocks.set(
    artworkId,
    task,
  )

  try {
    return await task
  } finally {
    proofLocks.delete(
      artworkId,
    )
  }
}

export async function prepareAllProofs(
  root,
  suppliedSource,
) {
  const source =
    suppliedSource ??
    createSupabaseSource(
      root,
    )

  if (
    typeof source
      .listPublishedArtworkIds !==
      'function'
  ) {
    throw new Error(
      'The Supabase source cannot list published artworks.',
    )
  }

  const ids =
    await source
      .listPublishedArtworkIds()

  const uniqueIds = [
    ...new Set(
      ids.filter(
        safeId,
      ),
    ),
  ]

  const results = []
  const failures = []

  /*
   * Deliberately sequential so
   * several high-resolution seller
   * images are never processed in
   * parallel on the development
   * machine.
   */
  for (
    const artworkId
    of uniqueIds
  ) {
    try {
      results.push(
        await ensureProof(
          root,
          artworkId,
          source,
        ),
      )
    } catch (
      error
    ) {
      failures.push({
        artworkId,

        message:
          error instanceof Error
            ? error.message
            : 'Unknown AR preparation error.',
      })
    }
  }

  if (
    failures.length
  ) {
    const details =
      failures
        .map(
          ({
            artworkId,
            message,
          }) =>
            `${artworkId}: ${message}`,
        )
        .join(
          '; ',
        )

    throw new Error(
      `AR proof preparation failed for ${failures.length} published artwork${failures.length === 1 ? '' : 's'}: ${details}`,
    )
  }

  return results
}

export function proofMiddleware(
  root,
  suppliedSource,
) {
  let source =
    suppliedSource

  const getSource =
    () => {
      if (
        !source
      ) {
        source =
          createSupabaseSource(
            root,
          )
      }

      return source
    }

  return async (
    req,
    res,
    next,
  ) => {
    const url =
      new URL(
        req.url ?? '/',
        'http://localhost',
      )

    if (
      !url.pathname.startsWith(
        PROOF_PREFIX,
      )
    ) {
      return next()
    }

    res.setHeader(
      'Cache-Control',
      'no-store',
    )

    res.setHeader(
      'X-Content-Type-Options',
      'nosniff',
    )

    if (
      ![
        'GET',
        'HEAD',
      ].includes(
        req.method,
      )
    ) {
      res.statusCode =
        405

      return res.end()
    }

    try {
      const manifestMatch =
        url.pathname.match(
          /^\/__ar-proof\/manifest\/([A-Za-z0-9_-]{1,128})$/,
        )

      if (
        manifestMatch
      ) {
        const artworkId =
          manifestMatch[1]

        const manifest =
          await ensureProof(
            root,
            artworkId,
            getSource(),
          )

        res.setHeader(
          'Content-Type',
          'application/json',
        )

        return res.end(
          req.method ===
            'HEAD'
            ? undefined
            : JSON.stringify(
                publicProof(
                  manifest,
                ),
              ),
        )
      }

      const modelMatch =
        url.pathname.match(
          /^\/__ar-proof\/model\/([A-Za-z0-9_-]{1,128})\/([a-f0-9]{64})\.glb$/,
        )

      if (
        !modelMatch
      ) {
        throw new Error(
          'Unknown AR proof path.',
        )
      }

      const [
        ,
        artworkId,
        version,
      ] =
        modelMatch

      const manifest =
        await readLocalManifest(
          root,
          artworkId,
        )

      const selectedVariant =
        FRAME_STYLE_KEYS
          .map(
            (
              frameStyle,
            ) =>
              manifest.frames[
                frameStyle
              ],
          )
          .find(
            (
              variant,
            ) =>
              variant.version ===
              version,
          )

      if (
        !selectedVariant
      ) {
        throw new Error(
          'Unselected artwork version.',
        )
      }

      const current =
        await readPublishedSource(
          {
            artworkId,

            imageId:
              manifest.imageId,
          },
          getSource(),
        )

      if (
        current.imagePath !==
          manifest.imagePath ||
        current.sourceSha256 !==
          manifest.sourceSha256
      ) {
        throw new Error(
          'Stale source.',
        )
      }

      const model =
        await readFile(
          modelFilename(
            root,
            artworkId,
            version,
          ),
        )

      if (
        sha256(
          model,
        ) !==
        version
      ) {
        throw new Error(
          'Corrupt asset.',
        )
      }

      res.setHeader(
        'Content-Type',
        'model/gltf-binary',
      )

      res.setHeader(
        'Content-Length',
        model.length,
      )

      return res.end(
        req.method ===
          'HEAD'
          ? undefined
          : model,
      )
    } catch {
      res.statusCode =
        404

      return res.end(
        'AR proof unavailable',
      )
    }
  }
}

export function arProofPlugin() {
  return {
    name:
      'artvault-local-ar-proof',

    apply:
      'serve',

    config:
      () => ({
        server: {
          fs: {
            deny: [
              '.env',
              '.env.*',
              '*.{crt,pem}',
              '**/.git/**',
              `**/${PROOF_DIRECTORY}/**`,
            ],
          },
        },
      }),

    configureServer(
      server,
    ) {
      server
        .middlewares
        .use(
          proofMiddleware(
            server.config.root,
          ),
        )
    },
  }
}