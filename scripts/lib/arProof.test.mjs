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
  ensureProof,
  estimateDisplaySize,
  generateProof,
  prepareAllProofs,
  proofMiddleware,
  readPublishedSource,
  validateSelection,
} from './arProof.mjs'

const selection = {
  artworkId: 'art1',
}

const directories = []

afterEach(async () => {
  for (const dir of directories.splice(0)) {
    if (
      path.dirname(path.resolve(dir)) !== path.resolve(os.tmpdir()) ||
      !path.basename(dir).startsWith('artvault-ar-test-')
    ) {
      throw new Error('Unsafe test cleanup path')
    }

    await rm(dir, {
      recursive: true,
      force: true,
    })
  }
})

async function temp() {
  const dir = await mkdtemp(
    path.join(os.tmpdir(), 'artvault-ar-test-'),
  )

  directories.push(dir)
  return dir
}

function picture(width = 40, height = 20, background = '#bb3311') {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background,
    },
  })
    .png()
    .toBuffer()
}

function makeArtwork({
  id = 'art1',
  status = 'PUBLISHED',
  sellerId = 'seller',
  images,
} = {}) {
  return {
    id,
    status,
    seller_id: sellerId,
    images:
      images ?? [
        {
          id: 'front.png',
          path: `${sellerId}/${id}/front.png`,
          order: 0,
          contentType: 'image/png',
        },
      ],
  }
}

function sourceFor({
  bytes,
  artwork = makeArtwork(),
  listIds = [artwork.id],
} = {}) {
  const imageBytes = bytes ?? Buffer.from('missing')

  return {
    getPublishedArtwork: vi.fn(async (artworkId) =>
      artworkId === artwork.id ? artwork : null,
    ),
    listPublishedArtworkIds: vi.fn(async () => listIds),
    downloadImage: vi.fn(async () => imageBytes),
  }
}

function multiSource(records) {
  const byId = new Map(records.map((record) => [record.artwork.id, record]))

  return {
    getPublishedArtwork: vi.fn(async (artworkId) =>
      byId.get(artworkId)?.artwork ?? null,
    ),
    listPublishedArtworkIds: vi.fn(async () => [...byId.keys()]),
    downloadImage: vi.fn(async (objectPath) => {
      for (const record of records) {
        const image = record.artwork.images.find(
          (entry) => entry.path === objectPath,
        )
        if (image) return record.bytes
      }
      throw new Error('missing object')
    }),
  }
}

async function request(middleware, url, method = 'GET') {
  const headers = {}

  const res = {
    statusCode: 200,
    setHeader: (key, value) => {
      headers[key] = value
    },
    end: vi.fn(),
  }

  const next = vi.fn()

  await middleware(
    {
      url,
      method,
    },
    res,
    next,
  )

  return {
    ...res,
    headers,
    next,
    body: res.end.mock.calls[0]?.[0],
  }
}

function glbDocument(glb) {
  const jsonLength = glb.readUInt32LE(12)

  return {
    jsonLength,
    document: JSON.parse(
      glb.subarray(20, 20 + jsonLength).toString(),
    ),
  }
}

function embeddedImage(glb) {
  const { jsonLength, document } = glbDocument(glb)
  const binary = glb.subarray(28 + jsonLength)
  const view = document.bufferViews[document.images[0].bufferView]

  return binary.subarray(
    view.byteOffset,
    view.byteOffset + view.byteLength,
  )
}

describe('automatic artwork selection and sizing', () => {
  it('accepts an artwork id without requiring dimensions or an image id', () => {
    expect(validateSelection(selection)).toEqual(selection)
  })

  it('accepts an explicit image id when an operator wants one image', () => {
    expect(
      validateSelection({
        artworkId: 'art1',
        imageId: 'detail.jpg',
      }),
    ).toEqual({
      artworkId: 'art1',
      imageId: 'detail.jpg',
    })
  })

  it.each([
    '../other',
    '',
    'art/other',
  ])('rejects unsafe artwork id %s', (artworkId) => {
    expect(() => validateSelection({ artworkId })).toThrow()
  })

  it('selects the lowest ordered artwork image automatically', async () => {
    const bytes = await picture()
    const artwork = makeArtwork({
      images: [
        {
          id: 'second.png',
          path: 'seller/art1/second.png',
          order: 2,
          contentType: 'image/png',
        },
        {
          id: 'front.png',
          path: 'seller/art1/front.png',
          order: 0,
          contentType: 'image/png',
        },
      ],
    })

    const source = sourceFor({ bytes, artwork })
    const result = await readPublishedSource(selection, source)

    expect(result.imageId).toBe('front.png')
    expect(source.downloadImage).toHaveBeenCalledWith(
      'seller/art1/front.png',
    )
  })

  it('uses an explicitly requested artwork image when it belongs to the artwork', async () => {
    const bytes = await picture()
    const artwork = makeArtwork({
      images: [
        {
          id: 'front.png',
          path: 'seller/art1/front.png',
          order: 0,
          contentType: 'image/png',
        },
        {
          id: 'detail.png',
          path: 'seller/art1/detail.png',
          order: 1,
          contentType: 'image/png',
        },
      ],
    })

    const source = sourceFor({ bytes, artwork })
    const result = await readPublishedSource(
      {
        artworkId: 'art1',
        imageId: 'detail.png',
      },
      source,
    )

    expect(result.imageId).toBe('detail.png')
    expect(source.downloadImage).toHaveBeenCalledWith(
      'seller/art1/detail.png',
    )
  })

  it.each([
    [2000, 1000, 1060, 560],
    [1000, 2000, 560, 1060],
    [600, 800, 585, 760],
    [1200, 800, 860, 593.3],
    [1000, 1000, 710, 710],
  ])(
    'estimates framed display size for %s × %s pixels',
    (width, height, expectedWidth, expectedHeight) => {
      const result = estimateDisplaySize(width, height)
      expect(result.widthMm).toBe(expectedWidth)
      expect(result.heightMm).toBe(expectedHeight)
      expect(result.frameMm).toBe(30)
      expect(result.includesFrame).toBe(true)
    },
  )
})

describe('framed GLB generation', () => {
  it('uses a double-sided material for reliable Android wall visibility', async () => {
    const jpeg = await sharp(await picture()).jpeg().toBuffer()
    const glb = buildFlatGlb(jpeg, 400, 200)
    const { document } = glbDocument(glb)

    expect(document.materials[0].doubleSided).toBe(true)
    expect(document.asset.generator).toContain('multi-supabase')
  })

  it('encodes the requested SI geometry and embedded image', async () => {
    const jpeg = await sharp(await picture()).jpeg().toBuffer()
    const glb = buildFlatGlb(jpeg, 400, 200)
    const { jsonLength, document } = glbDocument(glb)
    const binary = glb.subarray(28 + jsonLength)

    expect(glb.readUInt32LE(0)).toBe(0x46546c67)
    expect(glb.readUInt32LE(8)).toBe(glb.length)
    expect(document.accessors[0].min[0]).toBeCloseTo(-0.2, 7)
    expect(document.accessors[0].min[1]).toBeCloseTo(-0.1, 7)
    expect(document.accessors[0].max[0]).toBeCloseTo(0.2, 7)
    expect(document.accessors[0].max[1]).toBeCloseTo(0.1, 7)

    const indices = document.bufferViews[3]
    expect(
      Array.from({ length: 6 }, (_, index) =>
        binary.readUInt16LE(indices.byteOffset + index * 2),
      ),
    ).toEqual([0, 1, 2, 0, 2, 3])

    expect(embeddedImage(glb)).toEqual(jpeg)
  })

  it('generates a visible dark frame around the artwork', async () => {
    const root = await temp()
    const bytes = await picture()
    const source = sourceFor({ bytes })

    const manifest = await generateProof(root, selection, source)
    const glb = await readFile(
      path.join(
        root,
        `ar-proof.local/art1/${manifest.version}.glb`,
      ),
    )

    const { data, info } = await sharp(embeddedImage(glb))
      .raw()
      .toBuffer({ resolveWithObject: true })

    const pixel = (x, y) => {
      const offset = (y * info.width + x) * info.channels
      return [data[offset], data[offset + 1], data[offset + 2]]
    }

    const corner = pixel(2, 2)
    const centre = pixel(
      Math.floor(info.width / 2),
      Math.floor(info.height / 2),
    )

    expect(corner[0]).toBeLessThan(60)
    expect(corner[1]).toBeLessThan(60)
    expect(corner[2]).toBeLessThan(60)
    expect(centre[0]).toBeGreaterThan(100)
  })

  it('stores every artwork in its own directory', async () => {
    const root = await temp()
    const art1Bytes = await picture(40, 20, '#aa2200')
    const art2Bytes = await picture(20, 40, '#0022aa')

    const source = multiSource([
      {
        artwork: makeArtwork({ id: 'art1' }),
        bytes: art1Bytes,
      },
      {
        artwork: makeArtwork({ id: 'art2' }),
        bytes: art2Bytes,
      },
    ])

    const first = await generateProof(root, { artworkId: 'art1' }, source)
    const second = await generateProof(root, { artworkId: 'art2' }, source)

    expect(first.artworkId).toBe('art1')
    expect(second.artworkId).toBe('art2')

    expect(
      JSON.parse(
        await readFile(
          path.join(root, 'ar-proof.local/art1/manifest.json'),
          'utf8',
        ),
      ).artworkId,
    ).toBe('art1')

    expect(
      JSON.parse(
        await readFile(
          path.join(root, 'ar-proof.local/art2/manifest.json'),
          'utf8',
        ),
      ).artworkId,
    ).toBe('art2')
  })

  it('reuses a current deterministic local proof instead of changing its version', async () => {
    const root = await temp()
    const bytes = await picture()
    const source = sourceFor({ bytes })

    const first = await ensureProof(root, 'art1', source)
    const second = await ensureProof(root, 'art1', source)

    expect(second.version).toBe(first.version)
    expect(second).toEqual(first)
  })

  it.each([
    Buffer.alloc(0),
    Buffer.from('not an image'),
  ])('rejects empty or corrupt image bytes', async (bytes) => {
    await expect(
      generateProof(
        await temp(),
        selection,
        sourceFor({ bytes }),
      ),
    ).rejects.toThrow()
  })
})

describe('publication and per-artwork delivery boundary', () => {
  it.each([
    'DRAFT',
    'SUBMITTED',
    'REJECTED',
    'SUSPENDED',
  ])('rejects %s artwork', async (status) => {
    const source = sourceFor({
      bytes: await picture(),
      artwork: makeArtwork({ status }),
    })

    await expect(
      readPublishedSource(selection, source),
    ).rejects.toThrow('PUBLISHED')

    expect(source.downloadImage).not.toHaveBeenCalled()
  })

  it('does not trust an unrelated storage object path', async () => {
    const source = sourceFor({
      bytes: await picture(),
      artwork: makeArtwork({
        images: [
          {
            id: 'front.png',
            path: 'seller/other/front.png',
            order: 0,
            contentType: 'image/png',
          },
        ],
      }),
    })

    await expect(
      readPublishedSource(selection, source),
    ).rejects.toThrow('does not belong')

    expect(source.downloadImage).not.toHaveBeenCalled()
  })

  it('lazily generates a missing artwork proof from its manifest route', async () => {
    const root = await temp()
    const source = sourceFor({ bytes: await picture() })
    const middleware = proofMiddleware(root, source)

    const response = await request(
      middleware,
      '/__ar-proof/manifest/art1',
    )

    expect(response.statusCode).toBe(200)

    const body = JSON.parse(response.body)
    expect(body.artworkId).toBe('art1')
    expect(body.includesFrame).toBe(true)
    expect(body.modelUrl).toBe(
      `/__ar-proof/model/art1/${body.version}.glb`,
    )
  })

  it('serves only the current model version for the matching artwork', async () => {
    const root = await temp()
    const source = sourceFor({ bytes: await picture() })
    const middleware = proofMiddleware(root, source)

    const ready = await request(
      middleware,
      '/__ar-proof/manifest/art1',
    )

    const manifest = JSON.parse(ready.body)

    const model = await request(
      middleware,
      manifest.modelUrl,
    )

    expect(model.statusCode).toBe(200)
    expect(model.headers['Content-Type']).toBe('model/gltf-binary')
    expect(model.headers['Cache-Control']).toBe('no-store')

    expect(
      (
        await request(
          middleware,
          `/__ar-proof/model/other/${manifest.version}.glb`,
        )
      ).statusCode,
    ).toBe(404)

    expect(
      (
        await request(
          middleware,
          `/__ar-proof/model/art1/${'0'.repeat(64)}.glb`,
        )
      ).statusCode,
    ).toBe(404)
  })

  it('keeps multiple artwork manifest routes independent', async () => {
    const root = await temp()
    const source = multiSource([
      {
        artwork: makeArtwork({ id: 'art1' }),
        bytes: await picture(40, 20, '#aa2200'),
      },
      {
        artwork: makeArtwork({ id: 'art2' }),
        bytes: await picture(20, 40, '#0022aa'),
      },
    ])

    const middleware = proofMiddleware(root, source)

    const first = JSON.parse(
      (
        await request(
          middleware,
          '/__ar-proof/manifest/art1',
        )
      ).body,
    )

    const second = JSON.parse(
      (
        await request(
          middleware,
          '/__ar-proof/manifest/art2',
        )
      ).body,
    )

    expect(first.artworkId).toBe('art1')
    expect(second.artworkId).toBe('art2')
    expect(first.modelUrl).toContain('/model/art1/')
    expect(second.modelUrl).toContain('/model/art2/')
  })

  it('revokes a model when the publication is no longer available', async () => {
    const root = await temp()
    const bytes = await picture()
    const original = sourceFor({ bytes })
    const manifest = await generateProof(root, selection, original)

    const suspended = sourceFor({
      bytes,
      artwork: makeArtwork({ status: 'SUSPENDED' }),
    })

    const response = await request(
      proofMiddleware(root, suspended),
      `/__ar-proof/model/art1/${manifest.version}.glb`,
    )

    expect(response.statusCode).toBe(404)
  })

  it('revokes a model when the source image bytes change', async () => {
    const root = await temp()
    const originalBytes = await picture(40, 20, '#aa2200')
    const changedBytes = await picture(40, 20, '#0022aa')

    const manifest = await generateProof(
      root,
      selection,
      sourceFor({ bytes: originalBytes }),
    )

    const response = await request(
      proofMiddleware(
        root,
        sourceFor({ bytes: changedBytes }),
      ),
      `/__ar-proof/model/art1/${manifest.version}.glb`,
    )

    expect(response.statusCode).toBe(404)
  })

  it('refuses writes and unknown proof paths', async () => {
    const root = await temp()
    const source = sourceFor({ bytes: await picture() })
    const middleware = proofMiddleware(root, source)

    expect(
      (
        await request(
          middleware,
          '/__ar-proof/manifest/art1',
          'POST',
        )
      ).statusCode,
    ).toBe(405)

    expect(
      (
        await request(
          middleware,
          '/__ar-proof/unknown',
        )
      ).statusCode,
    ).toBe(404)
  })

  it('prepares every published artwork returned by Supabase', async () => {
    const root = await temp()
    const source = multiSource([
      {
        artwork: makeArtwork({ id: 'art1' }),
        bytes: await picture(40, 20),
      },
      {
        artwork: makeArtwork({ id: 'art2' }),
        bytes: await picture(20, 40),
      },
    ])

    const results = await prepareAllProofs(root, source)

    expect(results).toHaveLength(2)
    expect(results.map((result) => result.artworkId).sort()).toEqual([
      'art1',
      'art2',
    ])
  })

  it('is development-only and denies raw proof directory access', () => {
    const plugin = arProofPlugin()

    expect(plugin.apply).toBe('serve')
    expect(plugin.config().server.fs.deny).toContain(
      '**/ar-proof.local/**',
    )
    expect(plugin.config().server.fs.deny).toContain('.env.*')
  })

  it('fails closed for a corrupt cached model', async () => {
    const root = await temp()
    const bytes = await picture()
    const source = sourceFor({ bytes })
    const manifest = await generateProof(root, selection, source)

    await writeFile(
      path.join(
        root,
        `ar-proof.local/art1/${manifest.version}.glb`,
      ),
      'corrupt',
    )

    const response = await request(
      proofMiddleware(root, source),
      `/__ar-proof/model/art1/${manifest.version}.glb`,
    )

    expect(response.statusCode).toBe(404)
  })
})
