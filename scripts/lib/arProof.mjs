import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'

export const PROOF_DIRECTORY = 'ar-proof.local'
export const PROOF_PREFIX = '/__ar-proof/'
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const safeId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)

export function validateSelection(input) {
  if (!safeId(input?.artworkId) || typeof input.imageId !== 'string' || !/^[A-Za-z0-9_.-]{1,200}$/.test(input.imageId)) {
    throw new Error('Provide one artworkId and an existing imageId.')
  }
  for (const key of ['widthMm', 'heightMm']) {
    if (!Number.isSafeInteger(input[key]) || input[key] <= 0 || input[key] > 10000) {
      throw new Error(`${key} must be an explicitly measured integer from 1 to 10000 mm.`)
    }
  }
  if (typeof input.includesFrame !== 'boolean') throw new Error('Declare includesFrame as true or false. Image and measurements must describe the same rectangle.')
  return { artworkId: input.artworkId, imageId: input.imageId, widthMm: input.widthMm, heightMm: input.heightMm, includesFrame: input.includesFrame }
}

function decode(field) {
  if ('stringValue' in field) return field.stringValue
  if ('integerValue' in field) return Number(field.integerValue)
  if ('arrayValue' in field) return (field.arrayValue.values ?? []).map(decode)
  if ('mapValue' in field) return Object.fromEntries(Object.entries(field.mapValue.fields ?? {}).map(([k, v]) => [k, decode(v)]))
  return null
}

/** Anonymous REST read: the existing emulator rules, not Admin privileges, decide publication access. */
export async function readPublishedSource(selection, fetcher = fetch) {
  validateSelection(selection)
  const response = await fetcher(`http://127.0.0.1:8080/v1/projects/demo-artvault/databases/(default)/documents/artworks/${selection.artworkId}`, { signal: AbortSignal.timeout(5000), redirect: 'error' })
  if (!response.ok) throw new Error('Published artwork is not available from the development emulator.')
  const document = await response.json()
  const artwork = decode({ mapValue: { fields: document.fields ?? {} } })
  if (artwork.status !== 'PUBLISHED') throw new Error('Only PUBLISHED artwork can be used for this proof.')
  const image = artwork.images?.find((entry) => entry.id === selection.imageId)
  const expectedPath = `artworks/${artwork.sellerId}/${selection.artworkId}/${selection.imageId}`
  if (!image || image.path !== expectedPath || !['image/jpeg', 'image/png', 'image/webp'].includes(image.contentType)) throw new Error('Selected image is missing or does not belong to this artwork.')
  const url = new URL(image.url)
  if (!['http://127.0.0.1:9199', 'http://localhost:9199'].includes(url.origin) || decodeURIComponent(url.pathname) !== `/v0/b/demo-artvault.appspot.com/o/${expectedPath}`) {
    throw new Error('Phase 1 only accepts this artwork’s local demo-artvault Storage-emulator image URL.')
  }
  // Construct the fetch URL: never follow an arbitrary Firestore URL or redirect.
  const sourceUrl = new URL(`http://127.0.0.1:9199/v0/b/demo-artvault.appspot.com/o/${encodeURIComponent(expectedPath)}`)
  sourceUrl.searchParams.set('alt', 'media')
  if (url.searchParams.has('token')) sourceUrl.searchParams.set('token', url.searchParams.get('token'))
  const imageResponse = await fetcher(sourceUrl.href, { signal: AbortSignal.timeout(10000), redirect: 'error' })
  if (!imageResponse.ok || !imageResponse.body) throw new Error('Selected image could not be downloaded.')
  const chunks = []; let size = 0
  for await (const chunk of imageResponse.body) {
    size += chunk.length
    if (size > 10 * 1024 * 1024) throw new Error('Source image exceeds 10 MB.')
    chunks.push(Buffer.from(chunk))
  }
  const bytes = Buffer.concat(chunks)
  if (!bytes.length) throw new Error('Source image is empty.')
  return { bytes, imagePath: image.path, sourceSha256: sha256(bytes) }
}

/** Minimal glTF 2.0: a +Z-facing XY plane, SI units, embedded JPEG, no external dependencies. */
export function buildFlatGlb(jpeg, widthMm, heightMm) {
  if (![widthMm, heightMm].every((n) => Number.isSafeInteger(n) && n > 0 && n <= 10000)) throw new Error('Invalid measured dimensions.')
  const w = Math.fround(widthMm / 2000), h = Math.fround(heightMm / 2000)
  const positions = new Float32Array([-w, -h, 0, w, -h, 0, w, h, 0, -w, h, 0])
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])
  // glTF texture origin is the image's top left. Do not mirror or vertically flip the artwork.
  const uv = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0])
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3])
  const buffers = [Buffer.from(positions.buffer), Buffer.from(normals.buffer), Buffer.from(uv.buffer), Buffer.from(indices.buffer), jpeg]
  let offset = 0
  const views = buffers.map((buffer) => { const view = { buffer: 0, byteOffset: offset, byteLength: buffer.length }; offset += buffer.length; return view })
  const binary = Buffer.concat([...buffers, Buffer.alloc((4 - offset % 4) % 4)])
  const gltf = {
    asset: { version: '2.0', generator: 'ArtVault flat-wall proof v1' }, scene: 0,
    scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 }, doubleSided: false }],
    textures: [{ source: 0, sampler: 0 }], samplers: [{ wrapS: 33071, wrapT: 33071, magFilter: 9729, minFilter: 9987 }],
    images: [{ bufferView: 4, mimeType: 'image/jpeg' }], bufferViews: views,
    buffers: [{ byteLength: binary.length }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-w, -h, 0], max: [w, h, 0] },
      { bufferView: 1, componentType: 5126, count: 4, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 4, type: 'VEC2' },
      { bufferView: 3, componentType: 5123, count: 6, type: 'SCALAR' },
    ],
  }
  let json = Buffer.from(JSON.stringify(gltf)); json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)])
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + binary.length, 8); header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16)
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([header, json, binHeader, binary])
}

export async function generateProof(root, input, fetcher = fetch) {
  const selection = validateSelection(input)
  const source = await readPublishedSource(selection, fetcher)
  const { default: sharp } = await import('sharp')
  const oriented = await sharp(source.bytes, { limitInputPixels: 25_000_000 }).rotate().toBuffer({ resolveWithObject: true })
  if (oriented.info.width * selection.heightMm !== oriented.info.height * selection.widthMm) {
    throw new Error('Image aspect ratio does not match the measurements. Supply a correctly cropped front-facing image; no stretching or inferred dimensions are allowed.')
  }
  const jpeg = await sharp(oriented.data).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 85, chromaSubsampling: '4:4:4' }).toBuffer()
  const glb = buildFlatGlb(jpeg, selection.widthMm, selection.heightMm)
  if (glb.length > 5 * 1024 * 1024) throw new Error('Generated GLB exceeds the 5 MB proof budget.')
  const version = sha256(glb)
  const manifest = { schemaVersion: 1, ...selection, imagePath: source.imagePath, sourceSha256: source.sourceSha256, version, bytes: glb.length }
  const directory = path.join(root, PROOF_DIRECTORY)
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, `${version}.glb`), glb)
  await writeFile(path.join(directory, 'manifest.tmp'), JSON.stringify(manifest, null, 2) + '\n')
  await rename(path.join(directory, 'manifest.tmp'), path.join(directory, 'manifest.json'))
  return manifest
}

/** No static public files: revalidate publication, source bytes, and version on every request. */
export function proofMiddleware(root, fetcher = fetch) {
  return async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith(PROOF_PREFIX)) return next()
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (!['GET', 'HEAD'].includes(req.method)) { res.statusCode = 405; return res.end() }
    try {
      const directory = path.join(root, PROOF_DIRECTORY)
      const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'))
      validateSelection(manifest)
      if (manifest.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(manifest.version)) throw new Error('Invalid manifest')
      const manifestPath = `${PROOF_PREFIX}manifest/${manifest.artworkId}`
      const modelPath = `${PROOF_PREFIX}model/${manifest.version}.glb`
      if (![manifestPath, modelPath].includes(url.pathname)) throw new Error('Unselected artwork/version')
      const source = await readPublishedSource(manifest, fetcher)
      if (source.imagePath !== manifest.imagePath || source.sourceSha256 !== manifest.sourceSha256) throw new Error('Stale source')
      const model = await readFile(path.join(directory, `${manifest.version}.glb`))
      if (sha256(model) !== manifest.version) throw new Error('Corrupt asset')
      if (url.pathname === manifestPath) {
        res.setHeader('Content-Type', 'application/json')
        return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ artworkId: manifest.artworkId, imageId: manifest.imageId, widthMm: manifest.widthMm, heightMm: manifest.heightMm, includesFrame: manifest.includesFrame, modelUrl: modelPath, version: manifest.version }))
      }
      res.setHeader('Content-Type', 'model/gltf-binary')
      res.setHeader('Content-Length', model.length)
      return res.end(req.method === 'HEAD' ? undefined : model)
    } catch {
      // Do not reveal private artwork, tokens, paths, or emulator details.
      res.statusCode = 404; return res.end('AR proof unavailable')
    }
  }
}

export function arProofPlugin() {
  return {
    name: 'artvault-local-ar-proof', apply: 'serve',
    // Retain Vite's default deny patterns; never expose operator files through /@fs or root URLs.
    config: () => ({ server: { fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', `**/${PROOF_DIRECTORY}/**`] } } }),
    configureServer(server) { server.middlewares.use(proofMiddleware(server.config.root)) },
  }
}
