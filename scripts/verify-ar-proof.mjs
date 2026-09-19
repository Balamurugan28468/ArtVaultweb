// Read/verify the selected local proof; regenerate deterministically once.
// No database or Storage writes. Never substitutes a mocked viewer asset.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { generateProof, readPublishedSource, sha256 } from './lib/arProof.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const directory = `${root}/ar-proof.local`
const manifest = JSON.parse(await readFile(`${directory}/manifest.json`, 'utf8'))
const selection = JSON.parse(await readFile(`${directory}/selection.json`, 'utf8'))
const source = await readPublishedSource(selection)
assert.equal(source.sourceSha256, manifest.sourceSha256)
assert.equal(source.imagePath, manifest.imagePath)
const bytes = await readFile(`${directory}/${manifest.version}.glb`)
assert.equal(sha256(bytes), manifest.version)
assert.equal(bytes.length, manifest.bytes)
assert.equal(bytes.readUInt32LE(0), 0x46546c67)
assert.equal(bytes.readUInt32LE(4), 2)
assert.equal(bytes.readUInt32LE(8), bytes.length)
const jsonLength = bytes.readUInt32LE(12)
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString())
const binary = bytes.subarray(28 + jsonLength)
assert.deepEqual(gltf.nodes, [{ mesh: 0 }])
assert.deepEqual(gltf.scenes, [{ nodes: [0] }])
assert.equal(gltf.materials[0].doubleSided, false)
function values(index, count, type) {
  const view = gltf.bufferViews[index]
  return Array.from({ length: count }, (_, i) => type === 'float' ? binary.readFloatLE(view.byteOffset + i * 4) : binary.readUInt16LE(view.byteOffset + i * 2))
}
const positions = values(0, 12, 'float'), normals = values(1, 12, 'float')
const x = [0, 3, 6, 9].map((i) => positions[i]), y = [1, 4, 7, 10].map((i) => positions[i])
const width = Math.max(...x) - Math.min(...x), height = Math.max(...y) - Math.min(...y)
assert.ok(Math.abs(width - selection.widthMm / 1000) < 1e-7)
assert.ok(Math.abs(height - selection.heightMm / 1000) < 1e-7)
assert.ok(Math.abs(width / height - selection.widthMm / selection.heightMm) < 1e-6)
assert.deepEqual([2, 5, 8, 11].map((i) => positions[i]), [0, 0, 0, 0])
assert.deepEqual(normals, [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])
assert.deepEqual(values(2, 8, 'float'), [0, 1, 1, 1, 1, 0, 0, 0])
assert.deepEqual(values(3, 6, 'index'), [0, 1, 2, 0, 2, 3])
assert.equal(gltf.images[0].uri, undefined)
const view = gltf.bufferViews[gltf.images[0].bufferView]
const embedded = binary.subarray(view.byteOffset, view.byteOffset + view.byteLength)
const oriented = await sharp(source.bytes).rotate().toBuffer({ resolveWithObject: true })
assert.equal(oriented.info.width * selection.heightMm, oriented.info.height * selection.widthMm)
const expected = await sharp(oriented.data).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 85, chromaSubsampling: '4:4:4' }).toBuffer()
assert.deepEqual(embedded, expected) // No extra crop, stretch, image substitution, or UV flip.
const texture = await sharp(embedded).metadata()
assert.deepEqual(await generateProof(root, selection), manifest)
const origin = 'http://localhost:5173'
const response = await fetch(`${origin}/__ar-proof/manifest/${selection.artworkId}`)
assert.equal(response.status, 200)
const served = await response.json()
assert.equal(served.version, manifest.version)
assert.equal(served.widthMm, selection.widthMm)
assert.equal(served.heightMm, selection.heightMm)
const model = await fetch(`${origin}${served.modelUrl}`)
assert.equal(model.status, 200)
assert.equal(model.headers.get('cache-control'), 'no-store')
assert.equal(sha256(Buffer.from(await model.arrayBuffer())), manifest.version)
const route = `${origin}/artworks/${selection.artworkId}/ar`
assert.equal((await fetch(route)).status, 200)
assert.equal((await fetch(`${origin}/ar-proof.local/manifest.json`)).status, 403)
assert.equal((await fetch(`${origin}/__ar-proof/manifest/unselected-artwork`)).status, 404)
// Exercise stale-source readiness on the live middleware, then restore the
// exact operator file even if an assertion fails. No artwork/image is mutated.
const manifestFile = `${directory}/manifest.json`
const original = await readFile(manifestFile)
try {
  await writeFile(manifestFile, JSON.stringify({ ...manifest, sourceSha256: '0'.repeat(64) }))
  assert.equal((await fetch(`${origin}/__ar-proof/manifest/${selection.artworkId}`)).status, 404)
  assert.equal((await fetch(`${origin}${served.modelUrl}`)).status, 404)
} finally { await writeFile(manifestFile, original) }
assert.equal((await fetch(`${origin}/__ar-proof/manifest/${selection.artworkId}`)).status, 200)
const report = { verifiedAt: new Date().toISOString(), route, widthMeters: width, heightMeters: height, depthMeters: 0, orientation: 'XY plane, +Z front', texture: { width: texture.width, height: texture.height, format: texture.format }, sourceSha256: manifest.sourceSha256, modelSha256: manifest.version, bytes: bytes.length, deterministic: true, embeddedImageMatches: true, staleManifestRejected: true, rawFilesDenied: true, physicalDevice: 'pending' }
await writeFile(`${directory}/asset-verification.json`, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
