import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertIsolatedFirestoreTestEnvironment, TEST_PROJECT_ID } from '../test-support/emulatorTestEnv'

// Not part of `npm run test` — run via `npm run test:rules`, which launches
// a dedicated, disposable Firestore emulator (see artworks.rules.test.ts's
// own identical header comment for the full rationale) — never the real
// ArtVault development emulator.

let testEnv: RulesTestEnvironment

const EXISTING_PUBLISHED = {
  sellerId: 'alice',
  title: 'Existing Published',
  description: 'A published artwork fixture for likes rules tests.',
  price: 100000,
  category: 'painting',
  tags: [],
  images: [],
  inventoryCount: 1,
  status: 'PUBLISHED',
  reviewedAt: 1,
  rejectionReason: null,
  likeCount: 0,
  createdAt: 1,
  updatedAt: 1,
}

const EXISTING_DRAFT = { ...EXISTING_PUBLISHED, status: 'DRAFT', reviewedAt: null }
const EXISTING_SUBMITTED = { ...EXISTING_PUBLISHED, status: 'SUBMITTED', reviewedAt: null }
const EXISTING_REJECTED = { ...EXISTING_PUBLISHED, status: 'REJECTED', rejectionReason: 'blurry' }

beforeAll(async () => {
  const { host, port } = assertIsolatedFirestoreTestEnvironment()
  testEnv = await initializeTestEnvironment({
    projectId: TEST_PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host,
      port,
    },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

function customerContext(uid: string) {
  return testEnv.authenticatedContext(uid, { role: 'CUSTOMER' }).firestore()
}

function sellerContext(uid: string) {
  return testEnv.authenticatedContext(uid, { role: 'SELLER' }).firestore()
}

function anonContext() {
  return testEnv.unauthenticatedContext().firestore()
}

/** Seeds one artwork document (bypassing rules) and returns its id. */
async function seedArtwork(data: Record<string, unknown>): Promise<string> {
  let id = ''
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const ref = doc(collection(context.firestore(), 'artworks'))
    await setDoc(ref, data)
    id = ref.id
  })
  return id
}

/** Seeds one like document (bypassing rules) without touching the artwork's likeCount — used to set up "already liked" fixtures independently of the counter under test. */
async function seedLike(artworkId: string, uid: string): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'likes', artworkId, 'by', uid), { likedAt: 1 })
  })
}

// withSecurityRulesDisabled()'s own return type is hard-coded to
// Promise<void> regardless of what the callback returns (see
// @firebase/rules-unit-testing's own public type declarations) — so a read
// result must be captured via an outer-scope variable assigned *inside* the
// callback, exactly like artworks.rules.test.ts's own `artworkId = ref.id`
// pattern, never via the call's own return value.
async function readArtworkAdmin(artworkId: string) {
  let data: Record<string, unknown> | undefined
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snap = await getDoc(doc(context.firestore(), 'artworks', artworkId))
    data = snap.data()
  })
  return data
}

async function likeExistsAdmin(artworkId: string, uid: string): Promise<boolean> {
  let exists = false
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snap = await getDoc(doc(context.firestore(), 'likes', artworkId, 'by', uid))
    exists = snap.exists()
  })
  return exists
}

// The real client write sequence (src/features/likes, Module 12 Phase 3) —
// one atomic batch, never two separate calls.
function likeBatch(db: ReturnType<typeof customerContext>, artworkId: string, uid: string) {
  const batch = writeBatch(db)
  batch.set(doc(db, 'likes', artworkId, 'by', uid), { likedAt: serverTimestamp() })
  batch.update(doc(db, 'artworks', artworkId), { likeCount: increment(1) })
  return batch.commit()
}

function unlikeBatch(db: ReturnType<typeof customerContext>, artworkId: string, uid: string) {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'likes', artworkId, 'by', uid))
  batch.update(doc(db, 'artworks', artworkId), { likeCount: increment(-1) })
  return batch.commit()
}

describe('likes — success cases', () => {
  it('lets a CUSTOMER like a PUBLISHED artwork', async () => {
    const artworkId = await seedArtwork(EXISTING_PUBLISHED)
    const db = customerContext('mallory')

    await assertSucceeds(likeBatch(db, artworkId, 'mallory'))

    expect((await readArtworkAdmin(artworkId))?.likeCount).toBe(1)
    expect(await likeExistsAdmin(artworkId, 'mallory')).toBe(true)
  })

  it('lets a SELLER like a PUBLISHED artwork (including one that is not their own)', async () => {
    const artworkId = await seedArtwork(EXISTING_PUBLISHED)
    const db = sellerContext('bob')

    await assertSucceeds(likeBatch(db, artworkId, 'bob'))

    expect((await readArtworkAdmin(artworkId))?.likeCount).toBe(1)
  })

  it('lets a CUSTOMER unlike a previously liked PUBLISHED artwork', async () => {
    const artworkId = await seedArtwork({ ...EXISTING_PUBLISHED, likeCount: 1 })
    await seedLike(artworkId, 'mallory')
    const db = customerContext('mallory')

    await assertSucceeds(unlikeBatch(db, artworkId, 'mallory'))

    expect((await readArtworkAdmin(artworkId))?.likeCount).toBe(0)
    expect(await likeExistsAdmin(artworkId, 'mallory')).toBe(false)
  })

  it('lets a SELLER unlike a previously liked PUBLISHED artwork', async () => {
    const artworkId = await seedArtwork({ ...EXISTING_PUBLISHED, likeCount: 1 })
    await seedLike(artworkId, 'bob')
    const db = sellerContext('bob')

    await assertSucceeds(unlikeBatch(db, artworkId, 'bob'))

    expect((await readArtworkAdmin(artworkId))?.likeCount).toBe(0)
  })

  it('lets a user re-like after a valid unlike', async () => {
    const artworkId = await seedArtwork(EXISTING_PUBLISHED)
    const db = customerContext('mallory')

    await assertSucceeds(likeBatch(db, artworkId, 'mallory'))
    await assertSucceeds(unlikeBatch(db, artworkId, 'mallory'))
    await assertSucceeds(likeBatch(db, artworkId, 'mallory'))

    expect((await readArtworkAdmin(artworkId))?.likeCount).toBe(1)
  })

  it('lets two different users independently like the same artwork, with a correct final count', async () => {
    const artworkId = await seedArtwork(EXISTING_PUBLISHED)

    await assertSucceeds(likeBatch(customerContext('mallory'), artworkId, 'mallory'))
    await assertSucceeds(likeBatch(sellerContext('bob'), artworkId, 'bob'))

    expect((await readArtworkAdmin(artworkId))?.likeCount).toBe(2)
    expect(await likeExistsAdmin(artworkId, 'mallory')).toBe(true)
    expect(await likeExistsAdmin(artworkId, 'bob')).toBe(true)
  })
})

describe('likes — signed-out and cross-user denial', () => {
  it('denies a signed-out like attempt', async () => {
    const artworkId = await seedArtwork(EXISTING_PUBLISHED)
    await assertFails(likeBatch(anonContext(), artworkId, 'ghost'))
  })

  it('denies a signed-out unlike attempt', async () => {
    const artworkId = await seedArtwork({ ...EXISTING_PUBLISHED, likeCount: 1 })
    await seedLike(artworkId, 'mallory')
    await assertFails(unlikeBatch(anonContext(), artworkId, 'mallory'))
  })

  it('denies creating another user’s uid like document', async () => {
    const artworkId = await seedArtwork(EXISTING_PUBLISHED)
    const db = customerContext('mallory')
    await assertFails(likeBatch(db, artworkId, 'someone-else'))
  })

  it('denies deleting another user’s uid like document', async () => {
    const artworkId = await seedArtwork({ ...EXISTING_PUBLISHED, likeCount: 1 })
    await seedLike(artworkId, 'bob')
    const db = customerContext('mallory')
    await assertFails(unlikeBatch(db, artworkId, 'bob'))
  })

  it('denies reading another user’s like document directly', async () => {
    const artworkId = await seedArtwork(EXISTING_PUBLISHED)
    await seedLike(artworkId, 'bob')
    const db = customerContext('mallory')
    await assertFails(getDoc(doc(db, 'likes', artworkId, 'by', 'bob')))
  })

  it('allows a user to read their own like document', async () => {
    const artworkId = await seedArtwork(EXISTING_PUBLISHED)
    await seedLike(artworkId, 'mallory')
    const db = customerContext('mallory')
    await assertSucceeds(getDoc(doc(db, 'likes', artworkId, 'by', 'mallory')))
  })

  it('denies every list/query attempt against the by/ collection, for the owner and for anyone else', async () => {
    const artworkId = await seedArtwork(EXISTING_PUBLISHED)
    await seedLike(artworkId, 'mallory')

    await assertFails(getDocs(collection(customerContext('mallory'), 'likes', artworkId, 'by')))
    await assertFails(getDocs(collection(customerContext('bob'), 'likes', artworkId, 'by')))
    await assertFails(getDocs(collection(anonContext(), 'likes', artworkId, 'by')))
  })
})

describe('likes — artwork lifecycle gating', () => {
  it('denies liking a DRAFT artwork', async () => {
    const artworkId = await seedArtwork(EXISTING_DRAFT)
    await assertFails(likeBatch(customerContext('mallory'), artworkId, 'mallory'))
  })

  it('denies liking a SUBMITTED artwork', async () => {
    const artworkId = await seedArtwork(EXISTING_SUBMITTED)
    await assertFails(likeBatch(customerContext('mallory'), artworkId, 'mallory'))
  })

  it('denies liking a REJECTED artwork', async () => {
    const artworkId = await seedArtwork(EXISTING_REJECTED)
    await assertFails(likeBatch(customerContext('mallory'), artworkId, 'mallory'))
  })
})

describe('likes — mutual atomic invariant (the hardened Phase 2 core)', () => {
  it('denies creating a like document with no matching counter increment in the same batch', async () => {
    const artworkId = await seedArtwork(EXISTING_PUBLISHED)
    const db = customerContext('mallory')
    await assertFails(setDoc(doc(db, 'likes', artworkId, 'by', 'mallory'), { likedAt: serverTimestamp() }))
  })

  it('denies incrementing the counter alone, with no matching like-document creation', async () => {
    const artworkId = await seedArtwork(EXISTING_PUBLISHED)
    const db = customerContext('mallory')
    await assertFails(updateDoc(doc(db, 'artworks', artworkId), { likeCount: increment(1) }))
  })

  it('denies deleting a like document with no matching counter decrement in the same batch', async () => {
    const artworkId = await seedArtwork({ ...EXISTING_PUBLISHED, likeCount: 1 })
    await seedLike(artworkId, 'mallory')
    const db = customerContext('mallory')
    await assertFails(deleteDoc(doc(db, 'likes', artworkId, 'by', 'mallory')))
  })

  it('denies decrementing the counter alone, with no matching like-document deletion', async () => {
    const artworkId = await seedArtwork({ ...EXISTING_PUBLISHED, likeCount: 1 })
    await seedLike(artworkId, 'mallory')
    const db = customerContext('mallory')
    await assertFails(updateDoc(doc(db, 'artworks', artworkId), { likeCount: increment(-1) }))
  })

  it('denies a batch that decrements the counter while deleting a like document that was never created — the exact gap found and closed during architecture review', async () => {
    const artworkId = await seedArtwork({ ...EXISTING_PUBLISHED, likeCount: 1 })
    // Note: no seedLike() — the like document genuinely does not exist.
    const db = customerContext('mallory')
    await assertFails(unlikeBatch(db, artworkId, 'mallory'))

    expect((await readArtworkAdmin(artworkId))?.likeCount).toBe(1) // unchanged — the whole batch was rejected
  })

  it('denies a batch that increments the counter while creating a like document that already exists', async () => {
    const artworkId = await seedArtwork({ ...EXISTING_PUBLISHED, likeCount: 1 })
    await seedLike(artworkId, 'mallory')
    const db = customerContext('mallory')
    await assertFails(likeBatch(db, artworkId, 'mallory'))

    expect((await readArtworkAdmin(artworkId))?.likeCount).toBe(1) // unchanged
  })

  it('denies an increment of anything other than exactly +1, even paired with a valid like-document create', async () => {
    const artworkId = await seedArtwork(EXISTING_PUBLISHED)
    const db = customerContext('mallory')
    const batch = writeBatch(db)
    batch.set(doc(db, 'likes', artworkId, 'by', 'mallory'), { likedAt: serverTimestamp() })
    batch.update(doc(db, 'artworks', artworkId), { likeCount: increment(2) })
    await assertFails(batch.commit())
  })

  it('denies a decrement of anything other than exactly -1, even paired with a valid like-document delete', async () => {
    const artworkId = await seedArtwork({ ...EXISTING_PUBLISHED, likeCount: 5 })
    await seedLike(artworkId, 'mallory')
    const db = customerContext('mallory')
    const batch = writeBatch(db)
    batch.delete(doc(db, 'likes', artworkId, 'by', 'mallory'))
    batch.update(doc(db, 'artworks', artworkId), { likeCount: increment(-2) })
    await assertFails(batch.commit())
  })

  it('denies decrementing the counter below zero, even with a genuinely existing like document', async () => {
    const artworkId = await seedArtwork({ ...EXISTING_PUBLISHED, likeCount: 0 })
    await seedLike(artworkId, 'mallory')
    const db = customerContext('mallory')
    await assertFails(unlikeBatch(db, artworkId, 'mallory'))
  })
})

describe('likes — like-document field validation', () => {
  it('denies direct update of an existing like document', async () => {
    const artworkId = await seedArtwork({ ...EXISTING_PUBLISHED, likeCount: 1 })
    await seedLike(artworkId, 'mallory')
    const db = customerContext('mallory')
    await assertFails(updateDoc(doc(db, 'likes', artworkId, 'by', 'mallory'), { likedAt: serverTimestamp() }))
  })

  it('denies a like where likedAt is not request.time (a forged/client-chosen timestamp)', async () => {
    const artworkId = await seedArtwork(EXISTING_PUBLISHED)
    const db = customerContext('mallory')
    const batch = writeBatch(db)
    batch.set(doc(db, 'likes', artworkId, 'by', 'mallory'), { likedAt: new Date('2020-01-01') })
    batch.update(doc(db, 'artworks', artworkId), { likeCount: increment(1) })
    await assertFails(batch.commit())
  })

  it('denies a like document carrying an extra, unlisted field', async () => {
    const artworkId = await seedArtwork(EXISTING_PUBLISHED)
    const db = customerContext('mallory')
    const batch = writeBatch(db)
    batch.set(doc(db, 'likes', artworkId, 'by', 'mallory'), { likedAt: serverTimestamp(), note: 'nice piece' })
    batch.update(doc(db, 'artworks', artworkId), { likeCount: increment(1) })
    await assertFails(batch.commit())
  })
})

describe('likes — artwork field integrity', () => {
  it('denies a batch that changes likeCount together with any other artwork field (title)', async () => {
    const artworkId = await seedArtwork(EXISTING_PUBLISHED)
    const db = customerContext('mallory')
    const batch = writeBatch(db)
    batch.set(doc(db, 'likes', artworkId, 'by', 'mallory'), { likedAt: serverTimestamp() })
    batch.update(doc(db, 'artworks', artworkId), { likeCount: increment(1), title: 'Hacked Title' })
    await assertFails(batch.commit())
  })

  it('denies a batch that changes likeCount together with price', async () => {
    const artworkId = await seedArtwork(EXISTING_PUBLISHED)
    const db = customerContext('mallory')
    const batch = writeBatch(db)
    batch.set(doc(db, 'likes', artworkId, 'by', 'mallory'), { likedAt: serverTimestamp() })
    batch.update(doc(db, 'artworks', artworkId), { likeCount: increment(1), price: 1 })
    await assertFails(batch.commit())
  })

  it('denies a batch that changes likeCount together with status (an attempted self-publish via the likes path)', async () => {
    const artworkId = await seedArtwork(EXISTING_DRAFT)
    const db = customerContext('mallory')
    const batch = writeBatch(db)
    batch.set(doc(db, 'likes', artworkId, 'by', 'mallory'), { likedAt: serverTimestamp() })
    batch.update(doc(db, 'artworks', artworkId), { likeCount: increment(1), status: 'PUBLISHED' })
    await assertFails(batch.commit())
  })

  it('denies a non-owner attempting an ordinary field edit disguised alongside a like batch', async () => {
    const artworkId = await seedArtwork(EXISTING_PUBLISHED)
    const db = customerContext('mallory')
    const batch = writeBatch(db)
    batch.set(doc(db, 'likes', artworkId, 'by', 'mallory'), { likedAt: serverTimestamp() })
    batch.update(doc(db, 'artworks', artworkId), { likeCount: increment(1), sellerId: 'mallory' })
    await assertFails(batch.commit())
  })
})

describe('likes — mismatched uid/path/counter combinations', () => {
  it('denies a batch where the like-doc uid does not match the artwork counter delta’s implicit actor (cross-wiring two different artworks)', async () => {
    const artworkA = await seedArtwork(EXISTING_PUBLISHED)
    const artworkB = await seedArtwork(EXISTING_PUBLISHED)
    const db = customerContext('mallory')
    const batch = writeBatch(db)
    // Creates a like for artworkA, but increments artworkB's counter — the
    // two documents' own getAfter()/get() cross-checks are scoped to their
    // own artworkId path parameter, so this mismatch fails both ways.
    batch.set(doc(db, 'likes', artworkA, 'by', 'mallory'), { likedAt: serverTimestamp() })
    batch.update(doc(db, 'artworks', artworkB), { likeCount: increment(1) })
    await assertFails(batch.commit())
  })

  it('denies a batch attempting to like on behalf of another uid while incrementing the real actor’s own intended artwork', async () => {
    const artworkId = await seedArtwork(EXISTING_PUBLISHED)
    const db = customerContext('mallory')
    const batch = writeBatch(db)
    batch.set(doc(db, 'likes', artworkId, 'by', 'bob'), { likedAt: serverTimestamp() })
    batch.update(doc(db, 'artworks', artworkId), { likeCount: increment(1) })
    await assertFails(batch.commit())
  })
})

describe('likes — seller/owner artwork update paths remain unaffected', () => {
  it('still allows the owning seller to edit an ordinary DRAFT field, unrelated to likeCount', async () => {
    const artworkId = await seedArtwork(EXISTING_DRAFT)
    const db = sellerContext('alice')
    await assertSucceeds(
      updateDoc(doc(db, 'artworks', artworkId), { title: 'Updated Title', updatedAt: serverTimestamp() }),
    )
  })

  it('still denies a non-owner seller from editing an ordinary field on someone else’s DRAFT', async () => {
    const artworkId = await seedArtwork(EXISTING_DRAFT)
    const db = sellerContext('bob')
    await assertFails(updateDoc(doc(db, 'artworks', artworkId), { title: 'Hijacked', updatedAt: serverTimestamp() }))
  })

  it('still denies the owner submitting together with an unrelated field change (DRAFT -> SUBMITTED must touch only status/updatedAt)', async () => {
    const artworkId = await seedArtwork(EXISTING_DRAFT)
    const db = sellerContext('alice')
    await assertFails(
      updateDoc(doc(db, 'artworks', artworkId), { status: 'SUBMITTED', title: 'Sneaky', updatedAt: serverTimestamp() }),
    )
  })
})
