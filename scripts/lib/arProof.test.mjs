import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { buildFlatGlb, generateProof, proofMiddleware, readPublishedSource, validateSelection, arProofPlugin } from './arProof.mjs'

const selection = { artworkId: 'art1', imageId: 'front.png', widthMm: 400, heightMm: 200, includesFrame: false }
const directories = []
afterEach(async () => { for (const dir of directories.splice(0)) { if (path.dirname(path.resolve(dir)) !== path.resolve(os.tmpdir()) || !path.basename(dir).startsWith('artvault-ar-test-')) throw new Error('Unsafe test cleanup path'); await rm(dir, { recursive: true, force: true }) } })
async function temp() { const dir = await mkdtemp(path.join(os.tmpdir(), 'artvault-ar-test-')); directories.push(dir); return dir }
function api(bytes, status = 'PUBLISHED', imageUrl = 'http://127.0.0.1:9199/v0/b/demo-artvault.appspot.com/o/artworks%2Fseller%2Fart1%2Ffront.png?alt=media&token=test') {
  return vi.fn(async (url) => url.includes(':8080/') ? Response.json({ fields: {
    status: { stringValue: status }, sellerId: { stringValue: 'seller' }, images: { arrayValue: { values: [{ mapValue: { fields: {
      id: { stringValue: 'front.png' }, path: { stringValue: 'artworks/seller/art1/front.png' },
      url: { stringValue: imageUrl }, contentType: { stringValue: 'image/png' },
    } } }] } },
  } }) : new Response(bytes))
}
const picture = () => sharp({ create: { width: 40, height: 20, channels: 3, background: '#bb3311' } }).png().toBuffer()
async function request(middleware, url, method = 'GET') {
  const headers = {}; const res = { statusCode: 200, setHeader: (k, v) => { headers[k] = v }, end: vi.fn() }
  await middleware({ url, method }, res, vi.fn())
  return { ...res, headers, body: res.end.mock.calls[0]?.[0] }
}
describe('measured flat GLB', () => {
  it.each([0, -1, 1.5, undefined, NaN, 10001])('rejects unknown/invalid physical measurements: %s', (widthMm) => {
    expect(() => validateSelection({ ...selection, widthMm })).toThrow()
  })
  it('requires a selected artwork, image, and declared frame convention', () => {
    expect(() => validateSelection({ ...selection, artworkId: '../other' })).toThrow()
    expect(() => validateSelection({ ...selection, includesFrame: undefined })).toThrow()
  })
  it('encodes measured SI geometry, correct face winding/UV orientation, and embedded JPEG', async () => {
    const jpeg = await sharp(await picture()).jpeg().toBuffer()
    const glb = buildFlatGlb(jpeg, 400, 200)
    expect(glb.readUInt32LE(0)).toBe(0x46546c67)
    expect(glb.readUInt32LE(8)).toBe(glb.length)
    const jsonLength = glb.readUInt32LE(12)
    const document = JSON.parse(glb.subarray(20, 20 + jsonLength).toString())
    expect(document.accessors[0].min[0]).toBeCloseTo(-0.2, 7)
    expect(document.accessors[0].min[1]).toBeCloseTo(-0.1, 7)
    expect(document.accessors[0].max[0]).toBeCloseTo(0.2, 7)
    expect(document.accessors[0].max[1]).toBeCloseTo(0.1, 7)
    const binary = glb.subarray(28 + jsonLength)
    const uv = document.bufferViews[2]
    expect(Array.from({ length: 8 }, (_, i) => binary.readFloatLE(uv.byteOffset + i * 4))).toEqual([0, 1, 1, 1, 1, 0, 0, 0])
    const indices = document.bufferViews[3]
    expect(Array.from({ length: 6 }, (_, i) => binary.readUInt16LE(indices.byteOffset + i * 2))).toEqual([0, 1, 2, 0, 2, 3])
    const image = document.bufferViews[document.images[0].bufferView]
    expect(binary.subarray(image.byteOffset, image.byteOffset + image.byteLength)).toEqual(jpeg)
    expect(document.images[0].uri).toBeUndefined()
    expect(document.nodes).toEqual([{ mesh: 0 }]) // No hidden scale/rotation/translation.
    const positions = document.bufferViews[0], normals = document.bufferViews[1]
    for (let i = 0; i < 4; i++) {
      expect(binary.readFloatLE(positions.byteOffset + i * 12 + 8)).toBe(0)
      expect([0, 4, 8].map((offset) => binary.readFloatLE(normals.byteOffset + i * 12 + offset))).toEqual([0, 0, 1])
    }
  })
  it('generates a deterministic version once on the operator side', async () => {
    const root = await temp(), fetcher = api(await picture())
    const first = await generateProof(root, selection, fetcher), second = await generateProof(root, selection, fetcher)
    expect(second).toEqual(first)
    expect(first.bytes).toBeLessThan(5 * 1024 * 1024)
    expect(JSON.parse(await readFile(path.join(root, 'ar-proof.local/manifest.json'), 'utf8'))).toEqual(first)
  })
  it('refuses to stretch a mismatched source photograph', async () => {
    await expect(generateProof(await temp(), { ...selection, widthMm: 200 }, api(await picture()))).rejects.toThrow('aspect ratio')
  })
  it.each([0, -2, 2.5, undefined, null, 10001])('rejects invalid height independently: %s', (heightMm) => {
    expect(() => validateSelection({ ...selection, heightMm })).toThrow('heightMm')
  })
  it.each([Buffer.alloc(0), Buffer.from('not an image')])('rejects empty or corrupt source image bytes', async (bytes) => {
    await expect(generateProof(await temp(), selection, api(bytes))).rejects.toThrow()
  })
  it('preserves the entire asymmetric source through only the documented JPEG conversion', async () => {
    const bytes = await sharp(Buffer.from('<svg width="40" height="20"><rect width="20" height="20" fill="red"/><rect x="20" width="20" height="20" fill="blue"/></svg>')).png().toBuffer()
    const root = await temp(), manifest = await generateProof(root, selection, api(bytes))
    const glb = await readFile(path.join(root, `ar-proof.local/${manifest.version}.glb`))
    const size = glb.readUInt32LE(12), document = JSON.parse(glb.subarray(20, 20 + size).toString())
    const view = document.bufferViews[document.images[0].bufferView]
    const embedded = glb.subarray(28 + size + view.byteOffset, 28 + size + view.byteOffset + view.byteLength)
    const expected = await sharp(bytes).flatten({ background: '#ffffff' }).jpeg({ quality: 85, chromaSubsampling: '4:4:4' }).toBuffer()
    expect(embedded).toEqual(expected)
    expect(await sharp(embedded).metadata()).toMatchObject({ width: 40, height: 20 })
  })
})
describe('publication and local delivery boundary', () => {
  it.each(['DRAFT', 'SUBMITTED', 'REJECTED', 'SUSPENDED'])('rejects %s even if a response contains an image', async (status) => {
    const fetcher = api(await picture(), status)
    await expect(readPublishedSource(selection, fetcher)).rejects.toThrow('PUBLISHED')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('does not use Admin authorization or fetch arbitrary image hosts', async () => {
    const fetcher = api(await picture(), 'PUBLISHED', 'https://example.com/private.png')
    await expect(readPublishedSource(selection, fetcher)).rejects.toThrow('local')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][1].headers).toBeUndefined()
    expect(fetcher.mock.calls[0][1].redirect).toBe('error')
  })
  it('serves only the selected current version and refuses writes', async () => {
    const root = await temp(), fetcher = api(await picture())
    const manifest = await generateProof(root, selection, fetcher), middleware = proofMiddleware(root, fetcher)
    const ready = await request(middleware, '/__ar-proof/manifest/art1')
    expect(ready.statusCode).toBe(200)
    expect(JSON.parse(ready.body).widthMm).toBe(400)
    expect(ready.body).not.toContain('token')
    const model = await request(middleware, `/__ar-proof/model/${manifest.version}.glb`)
    expect(model.headers['Content-Type']).toBe('model/gltf-binary')
    expect(model.headers['Cache-Control']).toBe('no-store')
    expect((await request(middleware, '/__ar-proof/manifest/other')).statusCode).toBe(404)
    expect((await request(middleware, `/__ar-proof/model/${'0'.repeat(64)}.glb`)).statusCode).toBe(404)
    expect((await request(middleware, '/__ar-proof/manifest/art1', 'POST')).statusCode).toBe(405)
  })
  it('revokes future model reads on suspension, changed image bytes, corruption, or unavailable backend', async () => {
    const root = await temp(), bytes = await picture(), manifest = await generateProof(root, selection, api(bytes))
    const url = `/__ar-proof/model/${manifest.version}.glb`
    expect((await request(proofMiddleware(root, api(bytes, 'SUSPENDED')), url)).statusCode).toBe(404)
    expect((await request(proofMiddleware(root, api(Buffer.from('different'))), url)).statusCode).toBe(404)
    expect((await request(proofMiddleware(root, vi.fn().mockRejectedValue(new Error('offline'))), url)).statusCode).toBe(404)
    await writeFile(path.join(root, `ar-proof.local/${manifest.version}.glb`), 'corrupt')
    expect((await request(proofMiddleware(root, api(bytes)), url)).statusCode).toBe(404)
  })
  it('is development-only and denies raw operator directory access', () => {
    const plugin = arProofPlugin()
    expect(plugin.apply).toBe('serve')
    expect(plugin.config().server.fs.deny).toContain('**/ar-proof.local/**')
    expect(plugin.config().server.fs.deny).toContain('.env.*')
  })
  it('fails closed for a missing or malformed operator manifest', async () => {
    const root = await temp(), fetcher = api(await picture())
    expect((await request(proofMiddleware(root, fetcher), '/__ar-proof/manifest/art1')).statusCode).toBe(404)
    await generateProof(root, selection, fetcher)
    await writeFile(path.join(root, 'ar-proof.local/manifest.json'), JSON.stringify({ ...selection, schemaVersion: 99, version: 'a'.repeat(64) }))
    expect((await request(proofMiddleware(root, fetcher), '/__ar-proof/manifest/art1')).statusCode).toBe(404)
  })
})
