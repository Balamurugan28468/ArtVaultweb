import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

export const PROOF_DIRECTORY = 'ar-proof.local'
export const PROOF_PREFIX = '/__ar-proof/'

const ARTWORK_IMAGE_BUCKET = 'artwork-images'

const MAX_SOURCE_BYTES =
  10 * 1024 * 1024

const MAX_MODEL_BYTES =
  5 * 1024 * 1024

const FRAME_MM = 30

const ALLOWED_IMAGE_TYPES =
  new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
  ])

export const sha256 = (bytes) =>
  createHash('sha256')
    .update(bytes)
    .digest('hex')

const safeId = (value) =>
  typeof value === 'string' &&
  /^[A-Za-z0-9_-]{1,128}$/.test(
    value,
  )

const round1 = (value) =>
  Math.round(value * 10) / 10

function parseEnvText(text) {
  const values = {}

  for (
    const rawLine of text.split(
      /\r?\n/,
    )
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
      line = line
        .slice(7)
        .trim()
    }

    const equals =
      line.indexOf('=')

    if (equals <= 0) {
      continue
    }

    const key = line
      .slice(0, equals)
      .trim()

    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(
        key,
      )
    ) {
      continue
    }

    let value = line
      .slice(equals + 1)
      .trim()

    if (
      value.length >= 2 &&
      (
        (
          value.startsWith(
            '"',
          ) &&
          value.endsWith(
            '"',
          )
        ) ||
        (
          value.startsWith(
            "'",
          ) &&
          value.endsWith(
            "'",
          )
        )
      )
    ) {
      const quote =
        value[0]

      value = value.slice(
        1,
        -1,
      )

      if (quote === '"') {
        value = value
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
        value = value
          .slice(
            0,
            comment,
          )
          .trim()
      }
    }

    values[key] = value
  }

  return values
}

function readProjectEnv(root) {
  const values = {}

  const files = [
    '.env',
    '.env.local',
    '.env.development',
    '.env.development.local',
  ]

  for (
    const file of files
  ) {
    const filename =
      path.join(
        root,
        file,
      )

    if (
      !existsSync(filename)
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
    readProjectEnv(root)

  const url =
    process.env
      .VITE_SUPABASE_URL ??
    fileEnv
      .VITE_SUPABASE_URL

  const key =
    process.env
      .VITE_SUPABASE_PUBLISHABLE_KEY ??
    fileEnv
      .VITE_SUPABASE_PUBLISHABLE_KEY

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
    parsed = new URL(url)
  } catch {
    throw new Error(
      'AR proof Supabase URL is invalid.',
    )
  }

  if (
    parsed.protocol !==
      'https:' ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      'AR proof Supabase URL must use HTTPS without credentials.',
    )
  }

  return {
    url: parsed.origin,
    key,
  }
}

export function validateSelection(
  input,
) {
  if (
    !safeId(
      input?.artworkId,
    ) ||
    typeof input.imageId !==
      'string' ||
    !/^[A-Za-z0-9_.-]{1,200}$/.test(
      input.imageId,
    )
  ) {
    throw new Error(
      'Provide one artworkId and an existing imageId.',
    )
  }

  return {
    artworkId:
      input.artworkId,

    imageId:
      input.imageId,
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

  // Very wide panorama.
  if (ratio >= 2) {
    artworkWidthMm = 1000
    artworkHeightMm =
      artworkWidthMm /
      ratio
  }

  // Very tall artwork.
  else if (ratio <= 0.5) {
    artworkHeightMm = 1000
    artworkWidthMm =
      artworkHeightMm *
      ratio
  }

  // Normal landscape.
  else if (ratio > 1.15) {
    artworkWidthMm = 800
    artworkHeightMm =
      artworkWidthMm /
      ratio
  }

  // Normal portrait.
  else if (ratio < 0.87) {
    artworkHeightMm = 700
    artworkWidthMm =
      artworkHeightMm *
      ratio
  }

  // Square or near-square.
  else if (ratio >= 1) {
    artworkWidthMm = 650
    artworkHeightMm =
      artworkWidthMm /
      ratio
  } else {
    artworkHeightMm = 650
    artworkWidthMm =
      artworkHeightMm *
      ratio
  }

  artworkWidthMm =
    round1(artworkWidthMm)

  artworkHeightMm =
    round1(artworkHeightMm)

  return {
    sizingMode:
      'ESTIMATED_STANDARD_DISPLAY',

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

    includesFrame: true,
  }
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

      if (error) {
        throw new Error(
          'Published artwork could not be read from Supabase.',
        )
      }

      return data
    },

    async downloadImage(
      objectPath,
    ) {
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
            60,
          )

      if (
        error ||
        !data?.signedUrl
      ) {
        throw new Error(
          'Selected published artwork image could not be signed.',
        )
      }

      const response =
        await fetcher(
          data.signedUrl,
          {
            signal:
              AbortSignal.timeout(
                10000,
              ),

            redirect:
              'error',
          },
        )

      if (
        !response.ok ||
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
          Buffer.from(chunk)

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
    },
  }
}

/**
 * Reads only an RLS-visible PUBLISHED
 * artwork from Supabase.
 *
 * No service-role key or admin bypass
 * is used by the AR proof generator.
 */
export async function readPublishedSource(
  selection,
  source,
) {
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
        selection.artworkId,
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

  if (
    typeof artwork
      .seller_id !==
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
      : []

  const image =
    images.find(
      (entry) =>
        entry &&
        typeof entry ===
          'object' &&
        entry.id ===
          selection.imageId,
    )

  const expectedPath =
    `${artwork.seller_id}/${selection.artworkId}/${selection.imageId}`

  if (
    !image ||
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

  const downloaded =
    await source
      .downloadImage(
        expectedPath,
      )

  const bytes =
    Buffer.isBuffer(
      downloaded,
    )
      ? downloaded
      : Buffer.from(
          downloaded,
        )

  if (!bytes.length) {
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
    bytes,

    imagePath:
      expectedPath,

    sourceSha256:
      sha256(bytes),
  }
}

/**
 * Adds a real visible dark frame around
 * the artwork image.
 *
 * FRAME_MM controls both the physical
 * AR geometry and the visual border.
 */
export async function buildFramedJpeg(
  orientedBytes,
  geometry,
) {
  const scale =
    Math.min(
      2000 /
        geometry.widthMm,

      2000 /
        geometry.heightMm,
    )

  const framePixels =
    Math.max(
      2,
      Math.round(
        geometry.frameMm *
          scale,
      ),
    )

  const artworkWidthPixels =
    Math.max(
      1,
      Math.round(
        geometry
          .artworkWidthMm *
          scale,
      ),
    )

  const artworkHeightPixels =
    Math.max(
      1,
      Math.round(
        geometry
          .artworkHeightMm *
          scale,
      ),
    )

  return sharpArtwork(
    orientedBytes,
  )
    .resize({
      width:
        artworkWidthPixels,

      height:
        artworkHeightPixels,

      fit: 'fill',
    })
    .flatten({
      background:
        '#ffffff',
    })
    .extend({
      top:
        framePixels,

      bottom:
        framePixels,

      left:
        framePixels,

      right:
        framePixels,

      background: {
        r: 22,
        g: 22,
        b: 22,
        alpha: 1,
      },
    })
    .jpeg({
      quality: 88,

      chromaSubsampling:
        '4:4:4',
    })
    .toBuffer()
}

let sharpModule = null

async function loadSharp() {
  if (!sharpModule) {
    const module =
      await import(
        'sharp',
      )

    sharpModule =
      module.default
  }

  return sharpModule
}

function sharpArtwork(bytes) {
  if (!sharpModule) {
    throw new Error(
      'Sharp is not loaded.',
    )
  }

  return sharpModule(
    bytes,
    {
      limitInputPixels:
        25_000_000,
    },
  )
}

/**
 * Minimal glTF 2.0.
 *
 * The JPEG already contains the artwork
 * plus frame, so this plane represents
 * the complete framed display rectangle.
 */
export function buildFlatGlb(
  jpeg,
  widthMm,
  heightMm,
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
        value <= 10000,
    )
  ) {
    throw new Error(
      'Invalid AR display dimensions.',
    )
  }

  const w =
    Math.fround(
      widthMm / 2000,
    )

  const h =
    Math.fround(
      heightMm / 2000,
    )

  const positions =
    new Float32Array([
      -w, -h, 0,
      w, -h, 0,
      w, h, 0,
      -w, h, 0,
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
          (offset % 4)
        ) % 4,
      ),
    ])

  const gltf = {
    asset: {
      version: '2.0',

      generator:
        'ArtVault framed-wall AR proof v3-supabase',
    },

    scene: 0,

    scenes: [
      {
        nodes: [0],
      },
    ],

    nodes: [
      {
        mesh: 0,
      },
    ],

    meshes: [
      {
        primitives: [
          {
            attributes: {
              POSITION: 0,
              NORMAL: 1,
              TEXCOORD_0: 2,
            },

            indices: 3,
            material: 0,
          },
        ],
      },
    ],

    materials: [
      {
        pbrMetallicRoughness: {
          baseColorTexture: {
            index: 0,
          },

          metallicFactor: 0,

          roughnessFactor: 1,
        },

        doubleSided: false,
      },
    ],

    textures: [
      {
        source: 0,
        sampler: 0,
      },
    ],

    samplers: [
      {
        wrapS: 33071,
        wrapT: 33071,

        magFilter: 9729,
        minFilter: 9987,
      },
    ],

    images: [
      {
        bufferView: 4,

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
      {
        bufferView: 0,

        componentType:
          5126,

        count: 4,

        type: 'VEC3',

        min: [
          -w,
          -h,
          0,
        ],

        max: [
          w,
          h,
          0,
        ],
      },

      {
        bufferView: 1,

        componentType:
          5126,

        count: 4,

        type: 'VEC3',
      },

      {
        bufferView: 2,

        componentType:
          5126,

        count: 4,

        type: 'VEC2',
      },

      {
        bufferView: 3,

        componentType:
          5123,

        count: 6,

        type: 'SCALAR',
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
          (json.length % 4)
        ) % 4,

        32,
      ),
    ])

  const header =
    Buffer.alloc(20)

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
    Buffer.alloc(8)

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

export async function generateProof(
  root,
  input,
  suppliedSource,
) {
  const selection =
    validateSelection(input)

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

  const sharp =
    await loadSharp()

  const oriented =
    await sharp(
      published.bytes,
      {
        limitInputPixels:
          25_000_000,
      },
    )
      .rotate()
      .toBuffer({
        resolveWithObject:
          true,
      })

  if (
    !oriented.info.width ||
    !oriented.info.height
  ) {
    throw new Error(
      'The artwork image dimensions could not be determined.',
    )
  }

  const geometry =
    estimateDisplaySize(
      oriented.info.width,
      oriented.info.height,
    )

  const jpeg =
    await buildFramedJpeg(
      oriented.data,
      geometry,
    )

  const glb =
    buildFlatGlb(
      jpeg,
      geometry.widthMm,
      geometry.heightMm,
    )

  if (
    glb.length >
    MAX_MODEL_BYTES
  ) {
    throw new Error(
      'Generated GLB exceeds the 5 MB proof budget.',
    )
  }

  const version =
    sha256(glb)

  const manifest = {
    schemaVersion: 2,

    ...selection,

    ...geometry,

    imagePath:
      published.imagePath,

    sourceSha256:
      published.sourceSha256,

    version,

    bytes:
      glb.length,
  }

  const directory =
    path.join(
      root,
      PROOF_DIRECTORY,
    )

  await mkdir(
    directory,
    {
      recursive: true,
    },
  )

  await writeFile(
    path.join(
      directory,
      `${version}.glb`,
    ),

    glb,
  )

  await writeFile(
    path.join(
      directory,
      'manifest.tmp',
    ),

    `${JSON.stringify(
      manifest,
      null,
      2,
    )}\n`,
  )

  await rename(
    path.join(
      directory,
      'manifest.tmp',
    ),

    path.join(
      directory,
      'manifest.json',
    ),
  )

  return manifest
}

/**
 * The model stays development-only.
 *
 * Every read rechecks the current
 * Supabase publication state and source
 * image before returning the model.
 */
export function proofMiddleware(
  root,
  suppliedSource,
) {
  let source =
    suppliedSource

  const getSource = () => {
    if (!source) {
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
      res.statusCode = 405
      return res.end()
    }

    try {
      const directory =
        path.join(
          root,
          PROOF_DIRECTORY,
        )

      const manifest =
        JSON.parse(
          await readFile(
            path.join(
              directory,
              'manifest.json',
            ),

            'utf8',
          ),
        )

      validateSelection(
        manifest,
      )

      if (
        manifest.schemaVersion !==
          2 ||
        manifest
          .sizingMode !==
          'ESTIMATED_STANDARD_DISPLAY' ||
        manifest
          .includesFrame !==
          true ||
        manifest.frameMm !==
          FRAME_MM ||
        !/^[a-f0-9]{64}$/.test(
          manifest.version,
        )
      ) {
        throw new Error(
          'Invalid manifest',
        )
      }

      const manifestPath =
        `${PROOF_PREFIX}manifest/${manifest.artworkId}`

      const modelPath =
        `${PROOF_PREFIX}model/${manifest.version}.glb`

      if (
        ![
          manifestPath,
          modelPath,
        ].includes(
          url.pathname,
        )
      ) {
        throw new Error(
          'Unselected artwork/version',
        )
      }

      const current =
        await readPublishedSource(
          manifest,
          getSource(),
        )

      if (
        current.imagePath !==
          manifest.imagePath ||
        current.sourceSha256 !==
          manifest.sourceSha256
      ) {
        throw new Error(
          'Stale source',
        )
      }

      const model =
        await readFile(
          path.join(
            directory,
            `${manifest.version}.glb`,
          ),
        )

      if (
        sha256(model) !==
        manifest.version
      ) {
        throw new Error(
          'Corrupt asset',
        )
      }

      if (
        url.pathname ===
        manifestPath
      ) {
        res.setHeader(
          'Content-Type',
          'application/json',
        )

        return res.end(
          req.method ===
            'HEAD'
            ? undefined
            : JSON.stringify({
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

                modelUrl:
                  modelPath,

                version:
                  manifest.version,
              }),
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
      // Never expose signed URLs,
      // storage paths, environment
      // values, or backend details.
      res.statusCode = 404

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

    config: () => ({
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
      server.middlewares.use(
        proofMiddleware(
          server.config.root,
        ),
      )
    },
  }
}