import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

// Requires both the Firestore and Storage emulators running locally
// (127.0.0.1:8080 and 127.0.0.1:9199) — not part of `npm run test`; run
// separately via `npm run test:storage-rules` once an emulator is up (see
// docs/SECURITY.md). storage.rules calls firestore.get()/firestore.exists()
// to check an artwork's real owner/lifecycle state, so both emulators must
// be reachable even though only Storage rules are under test here — that
// cross-service call always bypasses Firestore's own rules, which is why
// seeding below uses withSecurityRulesDisabled rather than needing a
// SELLER-authenticated Firestore write.

let testEnv: RulesTestEnvironment

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

function artworkFixture(overrides: Record<string, unknown> = {}) {
  return {
    sellerId: 'alice',
    title: 'Sunset Over the Bay',
    description: 'A painting used as a fixture for Storage rules tests.',
    price: 100000,
    category: 'painting',
    tags: [],
    images: [],
    inventoryCount: 1,
    status: 'DRAFT',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-artvault',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

function sellerStorage(uid: string) {
  return testEnv.authenticatedContext(uid, { role: 'SELLER' }).storage()
}

function customerStorage(uid: string) {
  return testEnv.authenticatedContext(uid, { role: 'CUSTOMER' }).storage()
}

async function seedArtwork(artworkId: string, overrides: Record<string, unknown> = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'artworks', artworkId), artworkFixture(overrides))
  })
}

async function seedImage(path: string) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(context.storage(), path), JPEG_BYTES, { contentType: 'image/jpeg' })
  })
}

describe('artworks storage — write (upload)', () => {
  it('allows the owning seller to upload a supported image to their own DRAFT artwork', async () => {
    await seedArtwork('art1')
    await assertSucceeds(
      uploadBytes(ref(sellerStorage('alice'), 'artworks/alice/art1/img1.jpg'), JPEG_BYTES, { contentType: 'image/jpeg' }),
    )
  })

  it('blocks an unauthenticated upload', async () => {
    await seedArtwork('art1')
    const anonStorage = testEnv.unauthenticatedContext().storage()
    await assertFails(uploadBytes(ref(anonStorage, 'artworks/alice/art1/img1.jpg'), JPEG_BYTES, { contentType: 'image/jpeg' }))
  })

  it('blocks a CUSTOMER (no SELLER claim) from uploading, even into their own uid path', async () => {
    await seedArtwork('art1')
    await assertFails(
      uploadBytes(ref(customerStorage('alice'), 'artworks/alice/art1/img1.jpg'), JPEG_BYTES, { contentType: 'image/jpeg' }),
    )
  })

  it("blocks a seller from uploading into another seller's path", async () => {
    await seedArtwork('art1')
    await assertFails(
      uploadBytes(ref(sellerStorage('bob'), 'artworks/alice/art1/img1.jpg'), JPEG_BYTES, { contentType: 'image/jpeg' }),
    )
  })

  it('blocks uploading when the artwork document does not exist', async () => {
    await assertFails(
      uploadBytes(ref(sellerStorage('alice'), 'artworks/alice/does-not-exist/img1.jpg'), JPEG_BYTES, { contentType: 'image/jpeg' }),
    )
  })

  it("blocks uploading against an artwork that isn't actually this seller's", async () => {
    await seedArtwork('art1', { sellerId: 'bob' })
    await assertFails(
      uploadBytes(ref(sellerStorage('alice'), 'artworks/alice/art1/img1.jpg'), JPEG_BYTES, { contentType: 'image/jpeg' }),
    )
  })

  it('blocks uploading once the artwork is SUBMITTED (locked)', async () => {
    await seedArtwork('art1', { status: 'SUBMITTED' })
    await assertFails(
      uploadBytes(ref(sellerStorage('alice'), 'artworks/alice/art1/img1.jpg'), JPEG_BYTES, { contentType: 'image/jpeg' }),
    )
  })

  it('blocks an unsupported content type', async () => {
    await seedArtwork('art1')
    await assertFails(
      uploadBytes(ref(sellerStorage('alice'), 'artworks/alice/art1/img1.gif'), JPEG_BYTES, { contentType: 'image/gif' }),
    )
  })

  it('blocks an oversized upload', async () => {
    await seedArtwork('art1')
    const oversized = new Uint8Array(11 * 1024 * 1024)
    await assertFails(
      uploadBytes(ref(sellerStorage('alice'), 'artworks/alice/art1/big.jpg'), oversized, { contentType: 'image/jpeg' }),
    )
  })

  it('blocks an empty (zero-byte) upload', async () => {
    await seedArtwork('art1')
    await assertFails(
      uploadBytes(ref(sellerStorage('alice'), 'artworks/alice/art1/empty.jpg'), new Uint8Array(0), { contentType: 'image/jpeg' }),
    )
  })
})

describe('artworks storage — read', () => {
  it('allows the owner to read their own artwork image', async () => {
    await seedArtwork('art1')
    await seedImage('artworks/alice/art1/img1.jpg')
    await assertSucceeds(getBytes(ref(sellerStorage('alice'), 'artworks/alice/art1/img1.jpg')))
  })

  it("blocks another user from reading someone else's artwork image", async () => {
    await seedArtwork('art1')
    await seedImage('artworks/alice/art1/img1.jpg')
    await assertFails(getBytes(ref(sellerStorage('bob'), 'artworks/alice/art1/img1.jpg')))
  })

  it('blocks an unauthenticated read', async () => {
    await seedArtwork('art1')
    await seedImage('artworks/alice/art1/img1.jpg')
    const anonStorage = testEnv.unauthenticatedContext().storage()
    await assertFails(getBytes(ref(anonStorage, 'artworks/alice/art1/img1.jpg')))
  })
})

describe('artworks storage — delete', () => {
  it('allows the owner to delete their own DRAFT artwork image', async () => {
    await seedArtwork('art1')
    await seedImage('artworks/alice/art1/img1.jpg')
    await assertSucceeds(deleteObject(ref(sellerStorage('alice'), 'artworks/alice/art1/img1.jpg')))
  })

  it("blocks another seller from deleting this seller's image", async () => {
    await seedArtwork('art1')
    await seedImage('artworks/alice/art1/img1.jpg')
    await assertFails(deleteObject(ref(sellerStorage('bob'), 'artworks/alice/art1/img1.jpg')))
  })

  it('blocks deleting once the artwork is SUBMITTED (locked)', async () => {
    await seedArtwork('art1', { status: 'SUBMITTED' })
    await seedImage('artworks/alice/art1/img1.jpg')
    await assertFails(deleteObject(ref(sellerStorage('alice'), 'artworks/alice/art1/img1.jpg')))
  })
})
