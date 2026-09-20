import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {
  arProofPlugin,
  buildFlatGlb,
  estimateDisplaySize,
  generateProof,
  proofMiddleware,
  readPublishedSource,
  validateSelection,
} from './arProof.mjs'

const selection = {
  artworkId: 'art1',
  imageId: 'front.png',
}

const directories = []

afterEach(async () => {
  for (
    const dir of directories.splice(0)
  ) {
    if (
      path.dirname(
        path.resolve(dir),
      ) !== path.resolve(os.tmpdir()) ||
      !path
        .basename(dir)
        .startsWith(
          'artvault-ar-test-',
        )
    ) {
      throw new Error(
        'Unsafe test cleanup path',
      )
    }

    await rm(dir, {
      recursive: true,
      force: true,
    })
  }
})

async function temp() {
  const dir = await mkdtemp(
    path.join(
      os.tmpdir(),
      'artvault-ar-test-',
    ),
  )

  directories.push(dir)

  return dir
}

function api(
  bytes,
  status = 'PUBLISHED',
  objectPath =
    'seller/art1/front.png',
) {
  return {
    getPublishedArtwork: vi.fn(
      async () => ({
        id: 'art1',
        status,
        seller_id: 'seller',
        images: [
          {
            id: 'front.png',
            path: objectPath,
            order: 0,
            contentType:
              'image/png',
            size: bytes.length,

            // Deliberately ignored.
            // Source bytes must come from
            // the trusted Supabase
            // artwork-images bucket/path.
            url: 'https://example.com/untrusted.png',
          },
        ],
      }),
    ),

    downloadImage: vi.fn(
      async () => bytes,
    ),
  }
}

function picture(
  width = 40,
  height = 20,
) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: '#bb3311',
    },
  })
    .png()
    .toBuffer()
}

async function asymmetricPicture() {
  return sharp(
    Buffer.from(`
      <svg width="80" height="40">
        <rect width="40" height="40" fill="red"/>
        <rect x="40" width="40" height="40" fill="blue"/>
      </svg>
    `),
  )
    .png()
    .toBuffer()
}

function extractDocument(glb) {
  const jsonLength =
    glb.readUInt32LE(12)

  return {
    jsonLength,

    document: JSON.parse(
      glb
        .subarray(
          20,
          20 + jsonLength,
        )
        .toString(),
    ),
  }
}

function extractEmbeddedImage(glb) {
  const {
    jsonLength,
    document,
  } = extractDocument(glb)

  const binary =
    glb.subarray(
      28 + jsonLength,
    )

  const imageView =
    document.bufferViews[
      document.images[0]
        .bufferView
    ]

  return binary.subarray(
    imageView.byteOffset,
    imageView.byteOffset +
      imageView.byteLength,
  )
}

async function request(
  middleware,
  url,
  method = 'GET',
) {
  const headers = {}

  const res = {
    statusCode: 200,

    setHeader: (
      key,
      value,
    ) => {
      headers[key] =
        value
    },

    end: vi.fn(),
  }

  await middleware(
    {
      url,
      method,
    },
    res,
    vi.fn(),
  )

  return {
    ...res,
    headers,
    body:
      res.end.mock
        .calls[0]?.[0],
  }
}

describe(
  'automatic AR display sizing',
  () => {
    it(
      'accepts only an artwork and image selection',
      () => {
        expect(
          validateSelection(
            selection,
          ),
        ).toEqual(
          selection,
        )
      },
    )

    it(
      'rejects an unsafe artwork id',
      () => {
        expect(() =>
          validateSelection({
            ...selection,
            artworkId:
              '../other',
          }),
        ).toThrow()
      },
    )

    it(
      'rejects a missing image id',
      () => {
        expect(() =>
          validateSelection({
            artworkId:
              'art1',
          }),
        ).toThrow()
      },
    )

    it(
      'does not allow caller supplied dimensions to control sizing',
      () => {
        expect(
          validateSelection({
            ...selection,
            widthMm: 1,
            heightMm: 9999,
            includesFrame:
              false,
          }),
        ).toEqual(
          selection,
        )
      },
    )

    it(
      'uses a 1000 mm long artwork edge for a wide panorama',
      () => {
        expect(
          estimateDisplaySize(
            2000,
            1000,
          ),
        ).toEqual({
          sizingMode:
            'ESTIMATED_STANDARD_DISPLAY',

          artworkWidthMm:
            1000,

          artworkHeightMm:
            500,

          frameMm: 30,

          widthMm: 1060,

          heightMm: 560,

          includesFrame:
            true,
        })
      },
    )

    it(
      'uses a 1000 mm long artwork edge for a very tall image',
      () => {
        expect(
          estimateDisplaySize(
            1000,
            2000,
          ),
        ).toEqual({
          sizingMode:
            'ESTIMATED_STANDARD_DISPLAY',

          artworkWidthMm:
            500,

          artworkHeightMm:
            1000,

          frameMm: 30,

          widthMm: 560,

          heightMm: 1060,

          includesFrame:
            true,
        })
      },
    )

    it(
      'uses a 700 mm artwork height for a normal portrait',
      () => {
        expect(
          estimateDisplaySize(
            600,
            800,
          ),
        ).toEqual({
          sizingMode:
            'ESTIMATED_STANDARD_DISPLAY',

          artworkWidthMm:
            525,

          artworkHeightMm:
            700,

          frameMm: 30,

          widthMm: 585,

          heightMm: 760,

          includesFrame:
            true,
        })
      },
    )

    it(
      'uses an 800 mm artwork width for a normal landscape',
      () => {
        expect(
          estimateDisplaySize(
            1200,
            800,
          ),
        ).toEqual({
          sizingMode:
            'ESTIMATED_STANDARD_DISPLAY',

          artworkWidthMm:
            800,

          artworkHeightMm:
            533.3,

          frameMm: 30,

          widthMm: 860,

          heightMm: 593.3,

          includesFrame:
            true,
        })
      },
    )

    it(
      'uses a 650 mm artwork size for a square image',
      () => {
        expect(
          estimateDisplaySize(
            1000,
            1000,
          ),
        ).toEqual({
          sizingMode:
            'ESTIMATED_STANDARD_DISPLAY',

          artworkWidthMm:
            650,

          artworkHeightMm:
            650,

          frameMm: 30,

          widthMm: 710,

          heightMm: 710,

          includesFrame:
            true,
        })
      },
    )

    it.each([
      [0, 100],
      [100, 0],
      [-1, 100],
      [100, -1],
      [1.5, 100],
      [100, NaN],
    ])(
      'rejects invalid source dimensions %s × %s',
      (
        width,
        height,
      ) => {
        expect(() =>
          estimateDisplaySize(
            width,
            height,
          ),
        ).toThrow()
      },
    )
  },
)

describe(
  'framed GLB generation',
  () => {
    it(
      'encodes SI geometry with correct winding and UV orientation',
      async () => {
        const jpeg =
          await sharp(
            await picture(),
          )
            .jpeg()
            .toBuffer()

        const glb =
          buildFlatGlb(
            jpeg,
            400,
            200,
          )

        expect(
          glb.readUInt32LE(
            0,
          ),
        ).toBe(
          0x46546c67,
        )

        expect(
          glb.readUInt32LE(
            8,
          ),
        ).toBe(
          glb.length,
        )

        const {
          jsonLength,
          document,
        } =
          extractDocument(
            glb,
          )

        expect(
          document
            .accessors[0]
            .min[0],
        ).toBeCloseTo(
          -0.2,
          7,
        )

        expect(
          document
            .accessors[0]
            .min[1],
        ).toBeCloseTo(
          -0.1,
          7,
        )

        expect(
          document
            .accessors[0]
            .max[0],
        ).toBeCloseTo(
          0.2,
          7,
        )

        expect(
          document
            .accessors[0]
            .max[1],
        ).toBeCloseTo(
          0.1,
          7,
        )

        const binary =
          glb.subarray(
            28 +
              jsonLength,
          )

        const uv =
          document
            .bufferViews[2]

        expect(
          Array.from(
            {
              length: 8,
            },

            (
              _,
              index,
            ) =>
              binary.readFloatLE(
                uv.byteOffset +
                  index * 4,
              ),
          ),
        ).toEqual([
          0,
          1,
          1,
          1,
          1,
          0,
          0,
          0,
        ])

        const indices =
          document
            .bufferViews[3]

        expect(
          Array.from(
            {
              length: 6,
            },

            (
              _,
              index,
            ) =>
              binary.readUInt16LE(
                indices.byteOffset +
                  index * 2,
              ),
          ),
        ).toEqual([
          0,
          1,
          2,
          0,
          2,
          3,
        ])

        expect(
          extractEmbeddedImage(
            glb,
          ),
        ).toEqual(
          jpeg,
        )

        expect(
          document
            .images[0]
            .uri,
        ).toBeUndefined()

        expect(
          document.nodes,
        ).toEqual([
          {
            mesh: 0,
          },
        ])

        const positions =
          document
            .bufferViews[0]

        const normals =
          document
            .bufferViews[1]

        for (
          let index = 0;
          index < 4;
          index += 1
        ) {
          expect(
            binary.readFloatLE(
              positions.byteOffset +
                index * 12 +
                8,
            ),
          ).toBe(0)

          expect(
            [
              0,
              4,
              8,
            ].map(
              (offset) =>
                binary.readFloatLE(
                  normals.byteOffset +
                    index * 12 +
                    offset,
                ),
            ),
          ).toEqual([
            0,
            0,
            1,
          ])
        }
      },
    )

    it(
      'automatically generates a framed display model',
      async () => {
        const root =
          await temp()

        const manifest =
          await generateProof(
            root,
            selection,
            api(
              await picture(),
            ),
          )

        expect(
          manifest.sizingMode,
        ).toBe(
          'ESTIMATED_STANDARD_DISPLAY',
        )

        expect(
          manifest.includesFrame,
        ).toBe(true)

        expect(
          manifest.frameMm,
        ).toBe(30)

        expect(
          manifest.artworkWidthMm,
        ).toBe(1000)

        expect(
          manifest.artworkHeightMm,
        ).toBe(500)

        expect(
          manifest.widthMm,
        ).toBe(1060)

        expect(
          manifest.heightMm,
        ).toBe(560)

        expect(
          manifest.bytes,
        ).toBeLessThan(
          5 *
            1024 *
            1024,
        )
      },
    )

    it(
      'creates a visible dark frame around the embedded artwork image',
      async () => {
        const root =
          await temp()

        const manifest =
          await generateProof(
            root,
            selection,
            api(
              await picture(),
            ),
          )

        const glb =
          await readFile(
            path.join(
              root,
              `ar-proof.local/${manifest.version}.glb`,
            ),
          )

        const embedded =
          extractEmbeddedImage(
            glb,
          )

        const {
          data,
          info,
        } =
          await sharp(
            embedded,
          )
            .raw()
            .toBuffer({
              resolveWithObject:
                true,
            })

        expect(
          info.width,
        ).toBeGreaterThan(
          0,
        )

        expect(
          info.height,
        ).toBeGreaterThan(
          0,
        )

        const channels =
          info.channels

        const pixel = (
          x,
          y,
        ) => {
          const offset =
            (
              y *
                info.width +
              x
            ) *
            channels

          return [
            data[offset],
            data[
              offset + 1
            ],
            data[
              offset + 2
            ],
          ]
        }

        const corner =
          pixel(
            2,
            2,
          )

        const centre =
          pixel(
            Math.floor(
              info.width /
                2,
            ),
            Math.floor(
              info.height /
                2,
            ),
          )

        expect(
          corner[0],
        ).toBeLessThan(60)

        expect(
          corner[1],
        ).toBeLessThan(60)

        expect(
          corner[2],
        ).toBeLessThan(60)

        expect(
          centre[0],
        ).toBeGreaterThan(100)
      },
    )

    it(
      'preserves asymmetric artwork orientation inside the frame',
      async () => {
        const root =
          await temp()

        const manifest =
          await generateProof(
            root,
            selection,
            api(
              await asymmetricPicture(),
            ),
          )

        const glb =
          await readFile(
            path.join(
              root,
              `ar-proof.local/${manifest.version}.glb`,
            ),
          )

        const embedded =
          extractEmbeddedImage(
            glb,
          )

        const {
          data,
          info,
        } =
          await sharp(
            embedded,
          )
            .raw()
            .toBuffer({
              resolveWithObject:
                true,
            })

        const channels =
          info.channels

        const pixel = (
          x,
          y,
        ) => {
          const offset =
            (
              y *
                info.width +
              x
            ) *
            channels

          return [
            data[offset],
            data[
              offset + 1
            ],
            data[
              offset + 2
            ],
          ]
        }

        const y =
          Math.floor(
            info.height /
              2,
          )

        const left =
          pixel(
            Math.floor(
              info.width *
                0.3,
            ),
            y,
          )

        const right =
          pixel(
            Math.floor(
              info.width *
                0.7,
            ),
            y,
          )

        expect(
          left[0],
        ).toBeGreaterThan(
          left[2],
        )

        expect(
          right[2],
        ).toBeGreaterThan(
          right[0],
        )
      },
    )

    it(
      'generates a deterministic model version',
      async () => {
        const root =
          await temp()

        const source =
          api(
            await picture(),
          )

        const first =
          await generateProof(
            root,
            selection,
            source,
          )

        const second =
          await generateProof(
            root,
            selection,
            source,
          )

        expect(
          second,
        ).toEqual(
          first,
        )

        expect(
          JSON.parse(
            await readFile(
              path.join(
                root,
                'ar-proof.local/manifest.json',
              ),
              'utf8',
            ),
          ),
        ).toEqual(
          first,
        )
      },
    )

    it.each([
      Buffer.alloc(0),
      Buffer.from(
        'not an image',
      ),
    ])(
      'rejects empty or corrupt source image bytes',
      async (
        bytes,
      ) => {
        await expect(
          generateProof(
            await temp(),
            selection,
            api(bytes),
          ),
        ).rejects.toThrow()
      },
    )
  },
)

describe(
  'Supabase publication and local delivery boundary',
  () => {
    it.each([
      'DRAFT',
      'SUBMITTED',
      'REJECTED',
      'SUSPENDED',
    ])(
      'rejects %s artwork',
      async (
        status,
      ) => {
        const source =
          api(
            await picture(),
            status,
          )

        await expect(
          readPublishedSource(
            selection,
            source,
          ),
        ).rejects.toThrow(
          'PUBLISHED',
        )

        expect(
          source
            .getPublishedArtwork,
        ).toHaveBeenCalledTimes(
          1,
        )

        expect(
          source
            .downloadImage,
        ).not.toHaveBeenCalled()
      },
    )

    it(
      'does not trust unrelated storage object paths',
      async () => {
        const source =
          api(
            await picture(),
            'PUBLISHED',
            'seller/other-artwork/front.png',
          )

        await expect(
          readPublishedSource(
            selection,
            source,
          ),
        ).rejects.toThrow(
          'does not belong',
        )

        expect(
          source
            .downloadImage,
        ).not.toHaveBeenCalled()
      },
    )

    it(
      'downloads only the expected owner-scoped Supabase object path',
      async () => {
        const bytes =
          await picture()

        const source =
          api(bytes)

        const result =
          await readPublishedSource(
            selection,
            source,
          )

        expect(
          source.downloadImage,
        ).toHaveBeenCalledWith(
          'seller/art1/front.png',
        )

        expect(
          result.imagePath,
        ).toBe(
          'seller/art1/front.png',
        )

        expect(
          result.sourceSha256,
        ).toMatch(
          /^[a-f0-9]{64}$/,
        )
      },
    )

    it(
      'serves only the selected current framed version and refuses writes',
      async () => {
        const root =
          await temp()

        const source =
          api(
            await picture(),
          )

        const manifest =
          await generateProof(
            root,
            selection,
            source,
          )

        const middleware =
          proofMiddleware(
            root,
            source,
          )

        const ready =
          await request(
            middleware,
            '/__ar-proof/manifest/art1',
          )

        expect(
          ready.statusCode,
        ).toBe(200)

        const body =
          JSON.parse(
            ready.body,
          )

        expect(
          body.sizingMode,
        ).toBe(
          'ESTIMATED_STANDARD_DISPLAY',
        )

        expect(
          body.includesFrame,
        ).toBe(true)

        expect(
          body.frameMm,
        ).toBe(30)

        expect(
          body.widthMm,
        ).toBe(1060)

        expect(
          body.heightMm,
        ).toBe(560)

        expect(
          ready.body,
        ).not.toContain(
          'token',
        )

        expect(
          ready.body,
        ).not.toContain(
          'seller/art1',
        )

        const model =
          await request(
            middleware,
            `/__ar-proof/model/${manifest.version}.glb`,
          )

        expect(
          model.headers[
            'Content-Type'
          ],
        ).toBe(
          'model/gltf-binary',
        )

        expect(
          model.headers[
            'Cache-Control'
          ],
        ).toBe(
          'no-store',
        )

        expect(
          (
            await request(
              middleware,
              '/__ar-proof/manifest/other',
            )
          ).statusCode,
        ).toBe(404)

        expect(
          (
            await request(
              middleware,
              `/__ar-proof/model/${'0'.repeat(64)}.glb`,
            )
          ).statusCode,
        ).toBe(404)

        expect(
          (
            await request(
              middleware,
              '/__ar-proof/manifest/art1',
              'POST',
            )
          ).statusCode,
        ).toBe(405)
      },
    )

    it(
      'revokes future reads on suspension, changed source bytes, model corruption, or unavailable backend',
      async () => {
        const root =
          await temp()

        const bytes =
          await picture()

        const manifest =
          await generateProof(
            root,
            selection,
            api(bytes),
          )

        const url =
          `/__ar-proof/model/${manifest.version}.glb`

        expect(
          (
            await request(
              proofMiddleware(
                root,
                api(
                  bytes,
                  'SUSPENDED',
                ),
              ),
              url,
            )
          ).statusCode,
        ).toBe(404)

        expect(
          (
            await request(
              proofMiddleware(
                root,
                api(
                  Buffer.from(
                    'different',
                  ),
                ),
              ),
              url,
            )
          ).statusCode,
        ).toBe(404)

        const offline =
          api(bytes)

        offline
          .getPublishedArtwork
          .mockRejectedValue(
            new Error(
              'offline',
            ),
          )

        expect(
          (
            await request(
              proofMiddleware(
                root,
                offline,
              ),
              url,
            )
          ).statusCode,
        ).toBe(404)

        await writeFile(
          path.join(
            root,
            `ar-proof.local/${manifest.version}.glb`,
          ),
          'corrupt',
        )

        expect(
          (
            await request(
              proofMiddleware(
                root,
                api(bytes),
              ),
              url,
            )
          ).statusCode,
        ).toBe(404)
      },
    )

    it(
      'is development-only and denies raw operator files',
      () => {
        const plugin =
          arProofPlugin()

        expect(
          plugin.apply,
        ).toBe(
          'serve',
        )

        expect(
          plugin
            .config()
            .server
            .fs
            .deny,
        ).toContain(
          '**/ar-proof.local/**',
        )

        expect(
          plugin
            .config()
            .server
            .fs
            .deny,
        ).toContain(
          '.env.*',
        )
      },
    )

    it(
      'fails closed for a missing or malformed manifest',
      async () => {
        const root =
          await temp()

        const source =
          api(
            await picture(),
          )

        expect(
          (
            await request(
              proofMiddleware(
                root,
                source,
              ),
              '/__ar-proof/manifest/art1',
            )
          ).statusCode,
        ).toBe(404)

        const manifest =
          await generateProof(
            root,
            selection,
            source,
          )

        await writeFile(
          path.join(
            root,
            'ar-proof.local/manifest.json',
          ),

          JSON.stringify({
            ...manifest,
            schemaVersion:
              999,
          }),
        )

        expect(
          (
            await request(
              proofMiddleware(
                root,
                source,
              ),
              '/__ar-proof/manifest/art1',
            )
          ).statusCode,
        ).toBe(404)
      },
    )
  },
)