import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

// Requires the Firestore emulator running locally at 127.0.0.1:8080. Not
// part of `npm run test` — run separately via `npm run test:rules` once an
// emulator is up. See docs/SECURITY.md.

let testEnv: RulesTestEnvironment

function validArtwork(overrides: Record<string, unknown> = {}) {
  return {
    sellerId: 'alice',
    title: 'Sunset Over the Bay',
    description: 'An oil painting capturing golden hour light over the water.',
    price: 150000,
    category: 'painting',
    tags: ['blue', 'abstract'],
    images: [],
    inventoryCount: 2,
    status: 'DRAFT',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  }
}

const EXISTING_DRAFT = {
  sellerId: 'alice',
  title: 'Existing Draft',
  description: 'A pre-existing draft used as a fixture for update/delete tests.',
  price: 100000,
  category: 'painting',
  tags: [],
  images: [],
  inventoryCount: 1,
  status: 'DRAFT',
  createdAt: 1,
  updatedAt: 1,
}

const EXISTING_SUBMITTED = { ...EXISTING_DRAFT, status: 'SUBMITTED' }

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-artvault',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

function sellerContext(uid: string) {
  return testEnv.authenticatedContext(uid, { role: 'SELLER' }).firestore()
}

function customerContext(uid: string) {
  return testEnv.authenticatedContext(uid, { role: 'CUSTOMER' }).firestore()
}

describe('artworks/{artworkId} rules — create', () => {
  it('blocks a CUSTOMER (no SELLER claim) from creating an artwork', async () => {
    const aliceDb = customerContext('alice')
    await assertFails(addDoc(collection(aliceDb, 'artworks'), validArtwork()))
  })

  it('blocks an unauthenticated create', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(addDoc(collection(anonDb, 'artworks'), validArtwork()))
  })

  it('allows a SELLER to create their own artwork', async () => {
    const aliceDb = sellerContext('alice')
    await assertSucceeds(addDoc(collection(aliceDb, 'artworks'), validArtwork()))
  })

  it('blocks a forged sellerId (claiming to be a different seller)', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(addDoc(collection(aliceDb, 'artworks'), validArtwork({ sellerId: 'bob' })))
  })

  it('blocks creating with a non-empty images array (photos can only be added after the DRAFT exists — see Module 05 update tests below)', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(addDoc(collection(aliceDb, 'artworks'), validArtwork({ images: ['https://evil.example/x.png'] })))
  })

  it('blocks creating with any status other than DRAFT', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(addDoc(collection(aliceDb, 'artworks'), validArtwork({ status: 'SUBMITTED' })))
  })

  it('blocks creating with an unsupported/unsanctioned status value', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(addDoc(collection(aliceDb, 'artworks'), validArtwork({ status: 'PUBLISHED' })))
  })

  it('blocks an invalid category', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(addDoc(collection(aliceDb, 'artworks'), validArtwork({ category: 'not-a-real-category' })))
  })

  it('blocks a price below the minimum (must be at least ₹1, i.e. 100 paise)', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(addDoc(collection(aliceDb, 'artworks'), validArtwork({ price: 50 })))
  })

  it('blocks a non-integer (float) price', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(addDoc(collection(aliceDb, 'artworks'), validArtwork({ price: 1500.5 })))
  })

  it('blocks a negative inventoryCount', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(addDoc(collection(aliceDb, 'artworks'), validArtwork({ inventoryCount: -1 })))
  })

  it('blocks a title that is too short', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(addDoc(collection(aliceDb, 'artworks'), validArtwork({ title: 'A' })))
  })
})

describe('artworks/{artworkId} rules — read', () => {
  let artworkId: string

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const ref = await addDoc(collection(context.firestore(), 'artworks'), EXISTING_DRAFT)
      artworkId = ref.id
    })
  })

  it('lets the owning seller read their own artwork', async () => {
    const aliceDb = sellerContext('alice')
    await assertSucceeds(getDoc(doc(aliceDb, 'artworks', artworkId)))
  })

  it("blocks another seller from reading someone else's artwork", async () => {
    const bobDb = sellerContext('bob')
    await assertFails(getDoc(doc(bobDb, 'artworks', artworkId)))
  })

  it('blocks a customer from reading any artwork', async () => {
    const customerDb = customerContext('mallory')
    await assertFails(getDoc(doc(customerDb, 'artworks', artworkId)))
  })
})

// Regression coverage: reading a genuinely nonexistent artwork must not
// produce the same permission-denied error as reading one that exists but
// belongs to someone else — that collapsed "deleted" and "forbidden" into
// one indistinguishable, misleading message for a seller opening their own
// just-deleted artwork's edit link.
describe('artworks/{artworkId} rules — reading a nonexistent artwork', () => {
  it('allows any signed-in user to read a nonexistent artwork (empty result, not denied)', async () => {
    const aliceDb = sellerContext('alice')
    await assertSucceeds(getDoc(doc(aliceDb, 'artworks', 'does-not-exist')))
  })

  it('a customer reading a nonexistent artwork also succeeds with an empty result', async () => {
    const customerDb = customerContext('mallory')
    await assertSucceeds(getDoc(doc(customerDb, 'artworks', 'does-not-exist')))
  })

  it('still denies an unauthenticated read of a nonexistent artwork', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anonDb, 'artworks', 'does-not-exist')))
  })
})

describe('artworks/{artworkId} rules — update while DRAFT', () => {
  let artworkId: string

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const ref = await addDoc(collection(context.firestore(), 'artworks'), EXISTING_DRAFT)
      artworkId = ref.id
    })
  })

  it('allows the owner to edit ordinary fields while still DRAFT', async () => {
    const aliceDb = sellerContext('alice')
    await assertSucceeds(
      updateDoc(doc(aliceDb, 'artworks', artworkId), {
        title: 'Updated Title',
        description: 'An updated description that still meets the length minimum.',
        price: 200000,
        category: 'sculpture',
        tags: ['updated'],
        inventoryCount: 5,
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it("blocks another seller from editing this seller's artwork", async () => {
    const bobDb = sellerContext('bob')
    await assertFails(updateDoc(doc(bobDb, 'artworks', artworkId), { title: 'Hijacked', updatedAt: serverTimestamp() }))
  })

  it('blocks changing sellerId (ownership transfer)', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(updateDoc(doc(aliceDb, 'artworks', artworkId), { sellerId: 'bob', updatedAt: serverTimestamp() }))
  })

  it('blocks setting images to a malformed (non-object-list) value', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(
      updateDoc(doc(aliceDb, 'artworks', artworkId), {
        images: ['https://evil.example/x.png'],
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('allows submitting for review: DRAFT -> SUBMITTED, touching only status/updatedAt', async () => {
    const aliceDb = sellerContext('alice')
    await assertSucceeds(updateDoc(doc(aliceDb, 'artworks', artworkId), { status: 'SUBMITTED', updatedAt: serverTimestamp() }))
  })

  it('blocks submitting to an unsupported status value', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(updateDoc(doc(aliceDb, 'artworks', artworkId), { status: 'PUBLISHED', updatedAt: serverTimestamp() }))
  })

  it('blocks changing another field in the same write as submitting', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(
      updateDoc(doc(aliceDb, 'artworks', artworkId), {
        status: 'SUBMITTED',
        price: 999999,
        updatedAt: serverTimestamp(),
      }),
    )
  })
})

describe('artworks/{artworkId} rules — image updates while DRAFT (Module 05)', () => {
  let artworkId: string

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const ref = await addDoc(collection(context.firestore(), 'artworks'), EXISTING_DRAFT)
      artworkId = ref.id
    })
  })

  function validImage(overrides: Record<string, unknown> = {}) {
    return {
      id: 'img1.jpg',
      path: `artworks/alice/${artworkId}/img1.jpg`,
      url: 'http://127.0.0.1:9199/v0/b/demo-artvault.appspot.com/o/img1.jpg?alt=media',
      order: 0,
      contentType: 'image/jpeg',
      size: 1024,
      ...overrides,
    }
  }

  it('allows the owner to add a valid image', async () => {
    const aliceDb = sellerContext('alice')
    await assertSucceeds(
      updateDoc(doc(aliceDb, 'artworks', artworkId), { images: [validImage()], updatedAt: serverTimestamp() }),
    )
  })

  it("blocks an image path pointing at a different seller's folder", async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(
      updateDoc(doc(aliceDb, 'artworks', artworkId), {
        images: [validImage({ path: `artworks/bob/${artworkId}/img1.jpg` })],
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('blocks an image path pointing at a different artwork', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(
      updateDoc(doc(aliceDb, 'artworks', artworkId), {
        images: [validImage({ path: 'artworks/alice/some-other-artwork/img1.jpg' })],
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('blocks an unsupported content type', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(
      updateDoc(doc(aliceDb, 'artworks', artworkId), {
        images: [validImage({ contentType: 'image/gif' })],
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('blocks an oversized image', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(
      updateDoc(doc(aliceDb, 'artworks', artworkId), {
        images: [validImage({ size: 99_000_000 })],
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('blocks an image object with an unrecognized extra field', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(
      updateDoc(doc(aliceDb, 'artworks', artworkId), {
        images: [validImage({ downloadToken: 'sneaky' })],
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('blocks more than the maximum of 6 images', async () => {
    const aliceDb = sellerContext('alice')
    const images = Array.from({ length: 7 }, (_, i) => validImage({ id: `img${i}.jpg`, path: `artworks/alice/${artworkId}/img${i}.jpg`, order: i }))
    await assertFails(updateDoc(doc(aliceDb, 'artworks', artworkId), { images, updatedAt: serverTimestamp() }))
  })

  it("blocks another seller from adding images to this seller's artwork", async () => {
    const bobDb = sellerContext('bob')
    await assertFails(
      updateDoc(doc(bobDb, 'artworks', artworkId), {
        images: [validImage({ path: `artworks/bob/${artworkId}/img1.jpg` })],
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('blocks changing images in the same write as submitting for review', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(
      updateDoc(doc(aliceDb, 'artworks', artworkId), {
        status: 'SUBMITTED',
        images: [validImage()],
        updatedAt: serverTimestamp(),
      }),
    )
  })
})

describe('artworks/{artworkId} rules — SUBMITTED is locked', () => {
  let artworkId: string

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const ref = await addDoc(collection(context.firestore(), 'artworks'), EXISTING_SUBMITTED)
      artworkId = ref.id
    })
  })

  it('blocks reverting SUBMITTED back to DRAFT', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(updateDoc(doc(aliceDb, 'artworks', artworkId), { status: 'DRAFT', updatedAt: serverTimestamp() }))
  })

  it('blocks ordinary field edits once SUBMITTED, even by the owner', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(updateDoc(doc(aliceDb, 'artworks', artworkId), { title: 'Edited', updatedAt: serverTimestamp() }))
  })

  it('blocks deleting a SUBMITTED artwork', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(deleteDoc(doc(aliceDb, 'artworks', artworkId)))
  })

  it('blocks adding images once SUBMITTED, even a validly-shaped one', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(
      updateDoc(doc(aliceDb, 'artworks', artworkId), {
        images: [
          {
            id: 'img1.jpg',
            path: `artworks/alice/${artworkId}/img1.jpg`,
            url: 'http://127.0.0.1:9199/v0/b/demo-artvault.appspot.com/o/img1.jpg?alt=media',
            order: 0,
            contentType: 'image/jpeg',
            size: 1024,
          },
        ],
        updatedAt: serverTimestamp(),
      }),
    )
  })
})

describe('artworks/{artworkId} rules — delete', () => {
  it('allows the owner to delete their own DRAFT', async () => {
    let artworkId = ''
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const ref = await addDoc(collection(context.firestore(), 'artworks'), EXISTING_DRAFT)
      artworkId = ref.id
    })
    const aliceDb = sellerContext('alice')
    await assertSucceeds(deleteDoc(doc(aliceDb, 'artworks', artworkId)))
  })

  it("blocks another seller from deleting this seller's DRAFT", async () => {
    let artworkId = ''
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const ref = await addDoc(collection(context.firestore(), 'artworks'), EXISTING_DRAFT)
      artworkId = ref.id
    })
    const bobDb = sellerContext('bob')
    await assertFails(deleteDoc(doc(bobDb, 'artworks', artworkId)))
  })

  it('blocks a CUSTOMER (no SELLER claim) from deleting any artwork, even their own uid as sellerId', async () => {
    let artworkId = ''
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const ref = await addDoc(collection(context.firestore(), 'artworks'), { ...EXISTING_DRAFT, sellerId: 'mallory' })
      artworkId = ref.id
    })
    const malloryDb = customerContext('mallory')
    await assertFails(deleteDoc(doc(malloryDb, 'artworks', artworkId)))
  })

  it('blocks deleting a nonexistent artwork (safe failure, not a crash)', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(deleteDoc(doc(aliceDb, 'artworks', 'does-not-exist')))
  })
})
