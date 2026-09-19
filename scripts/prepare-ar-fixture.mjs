// Explicit opt-in, local-only calibration fixture. Never imports Admin credentials,
// accepts a project/host override, or changes an existing artwork/account.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { sha256 } from './lib/arProof.mjs'

if (process.argv.length !== 3 || process.argv[2] !== '--demo-artvault-only') {
  throw new Error('Usage: node scripts/prepare-ar-fixture.mjs --demo-artvault-only')
}
const root = fileURLToPath(new URL('../ar-proof.local/', import.meta.url))
const selection = { artworkId: 'ar-dev-calibration-300x200-v1', imageId: 'front.png', widthMm: 300, heightMm: 200, includesFrame: false }
const sellerId = 'ar-dev-calibration-artist-v1'
const firestore = 'http://127.0.0.1:8080/v1/projects/demo-artvault/databases/(default)/documents'
const storage = 'http://127.0.0.1:9199/v0/b/demo-artvault.appspot.com/o'
const imagePath = `artworks/${sellerId}/${selection.artworkId}/${selection.imageId}`
const marker = 'artvault-ar-calibration-v1'
const headers = { Authorization: 'Bearer owner' } // Firebase emulator-only owner token, not a production credential.
const request = (url, options = {}) => fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000) })

// Dimensions are deliberately assigned for a printable calibration rectangle.
// Pixels are chosen to represent those dimensions, never used to infer them.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 300 200">
<rect width="300" height="200" fill="#fff6db"/>
<path d="M0 0H300V200H0Z" fill="none" stroke="#172554" stroke-width="4"/>
<path d="M50 0V200M100 0V200M150 0V200M200 0V200M250 0V200M0 50H300M0 100H300M0 150H300" stroke="#d4c8aa" stroke-width=".6"/>
<circle cx="48" cy="65" r="25" fill="#df493c"/>
<path d="M130 90L170 25L210 90Z" fill="#197c79"/>
<rect x="235" y="35" width="40" height="55" fill="#365ab4"/>
<g fill="#172554" font-family="sans-serif" text-anchor="middle">
<text x="150" y="16" font-size="8">TOP / FRONT</text>
<text x="150" y="117" font-size="10">AR DEVELOPMENT CALIBRATION</text>
<text x="150" y="134" font-size="9">300 x 200 mm / NO FRAME</text>
<text x="150" y="148" font-size="6">Assigned print size - not an owner-measured artwork</text>
<text x="25" y="187" font-size="8">LEFT</text><text x="274" y="187" font-size="8">RIGHT</text>
<text x="150" y="181" font-size="6">50 mm reference</text>
</g><path d="M125 190H175M125 186V194M175 186V194" stroke="#172554" stroke-width="1"/>
</svg>`
const image = await sharp(Buffer.from(svg)).png().toBuffer()
await mkdir(root, { recursive: true })
try {
  const previous = JSON.parse(await readFile(`${root}/selection.json`, 'utf8'))
  if (JSON.stringify(previous) !== JSON.stringify(selection)) throw new Error('An operator selection already exists. Refusing to replace it.')
} catch (error) { if (error.code !== 'ENOENT') throw error }

const fields = (value) => Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]))
function encode(value) {
  if (value === null) return { nullValue: null }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } }
  if (typeof value === 'number') return { integerValue: String(value) }
  if (typeof value === 'object') return { mapValue: { fields: fields(value) } }
  return { stringValue: value }
}
const now = { timestampValue: new Date().toISOString() }
const existingImage = await request(`${storage}/${encodeURIComponent(imagePath)}?alt=media`, { headers })
if (existingImage.ok) {
  if (sha256(Buffer.from(await existingImage.arrayBuffer())) !== sha256(image)) throw new Error('Existing fixture image differs. Refusing to overwrite it.')
} else if (existingImage.status === 404) {
  const upload = await request(`${storage}?uploadType=media&name=${encodeURIComponent(imagePath)}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'image/png' }, body: image })
  if (!upload.ok) throw new Error(`Local fixture upload failed: ${upload.status}`)
} else throw new Error(`Could not inspect local image: ${existingImage.status}`)
const metadataResponse = await request(`${storage}/${encodeURIComponent(imagePath)}`, { headers })
if (!metadataResponse.ok) throw new Error('Could not read fixture download metadata.')
const metadata = await metadataResponse.json()
const token = metadata.downloadTokens?.split(',')[0]
if (!token) throw new Error('Fixture image has no download token; existing Storage rules must remain unchanged.')
// Use the same token-bearing download URL as the existing artwork upload flow.
const imageUrl = `${storage}/${encodeURIComponent(imagePath)}?alt=media&token=${encodeURIComponent(token)}`
const artwork = fields({ sellerId, title: 'AR DEV FIXTURE - 300 x 200 mm calibration print',
  description: 'DEVELOPMENT FIXTURE ONLY. Assigned 300 x 200 mm print size, no frame; not an owner-measured original. Not for sale. Use a tape-marked rectangle to validate AR scale.',
  price: 0, category: 'other', tags: ['ar-development-fixture'], inventoryCount: 0,
  status: 'PUBLISHED', rejectionReason: null, likeCount: 0, developmentFixture: marker,
  images: [{ id: selection.imageId, path: imagePath, url: imageUrl, order: 0, contentType: 'image/png', size: image.length }],
})
Object.assign(artwork, { createdAt: now, updatedAt: now, reviewedAt: now })
const artist = { ...fields({ uid: sellerId, displayName: 'AR Development Fixture (not a seller)', bio: 'Local calibration fixture only. No real seller account or sale inventory.', developmentFixture: marker }), createdAt: now, updatedAt: now }
const writes = []
for (const [relative, data] of [[`artworks/${selection.artworkId}`, artwork], [`artists/${sellerId}`, artist]]) {
  const response = await request(`${firestore}/${relative}`, { headers })
  if (response.ok) {
    const existing = await response.json()
    if (existing.fields?.developmentFixture?.stringValue !== marker) throw new Error(`Refusing to overwrite existing ${relative}`)
    if (relative.startsWith('artworks/') && existing.fields?.status?.stringValue !== 'PUBLISHED') throw new Error('Existing fixture is not published; refusing to bypass its current moderation state.')
    if (relative.startsWith('artworks/') && existing.fields?.images?.arrayValue?.values?.[0]?.mapValue?.fields?.url?.stringValue !== imageUrl) {
      writes.push({ update: { name: existing.name, fields: { images: artwork.images } }, updateMask: { fieldPaths: ['images'] }, currentDocument: { updateTime: existing.updateTime } })
    }
  } else if (response.status === 404) {
    writes.push({ update: { name: `projects/demo-artvault/databases/(default)/documents/${relative}`, fields: data }, currentDocument: { exists: false } })
  } else throw new Error(`Could not inspect local fixture: ${response.status}`)
}
if (writes.length) {
  const response = await request(`${firestore}:commit`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) })
  if (!response.ok) throw new Error(`Local fixture creation failed: ${response.status}`)
}
await writeFile(`${root}/calibration.svg`, svg)
await writeFile(`${root}/selection.json`, JSON.stringify(selection, null, 2) + '\n')
console.log(JSON.stringify({ project: 'demo-artvault', selection, fixtureWrites: writes.length, sourceSha256: sha256(image), note: 'Assigned calibration size; physical validation pending. Run npm.cmd run ar:prepare -- ar-proof.local/selection.json' }, null, 2))
