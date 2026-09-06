import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertIsolatedFirestoreTestEnvironment, TEST_PROJECT_ID } from '../test-support/emulatorTestEnv'

// Not part of `npm run test` — run via `npm run test:rules`, which launches
// a dedicated, disposable Firestore emulator via `firebase emulators:exec`
// (see firebase.test.json and package.json) and never the real ArtVault
// development emulator. assertIsolatedFirestoreTestEnvironment() below is a
// fail-closed guard against ever accidentally connecting to that dev
// instance instead — see test-support/emulatorTestEnv.ts and
// ARTVAULT_PROJECT_STATE.md's Module 08 write-up for the real incident this
// prevents.

let testEnv: RulesTestEnvironment

function validArtistProfile(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'alice',
    displayName: 'Alice Fine Art',
    bio: 'Oil paintings and limited-edition prints, made in Jaipur.',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  }
}

const EXISTING_PROFILE = {
  uid: 'alice',
  displayName: 'Alice Fine Art',
  bio: 'Oil paintings and limited-edition prints, made in Jaipur.',
  createdAt: 1,
  updatedAt: 1,
}

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

function sellerContext(uid: string) {
  return testEnv.authenticatedContext(uid, { role: 'SELLER' }).firestore()
}

function customerContext(uid: string) {
  return testEnv.authenticatedContext(uid, { role: 'CUSTOMER' }).firestore()
}

async function seedProfile(overrides: Record<string, unknown> = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'artists', 'alice'), { ...EXISTING_PROFILE, ...overrides })
  })
}

describe('artists/{artistId} rules — public read', () => {
  it('lets a signed-out visitor read an approved public artist profile', async () => {
    await seedProfile()
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertSucceeds(getDoc(doc(anonDb, 'artists', 'alice')))
  })

  it('lets an authenticated customer read it', async () => {
    await seedProfile()
    const customerDb = customerContext('mallory')
    await assertSucceeds(getDoc(doc(customerDb, 'artists', 'alice')))
  })

  it('lets another seller read it', async () => {
    await seedProfile()
    const bobDb = sellerContext('bob')
    await assertSucceeds(getDoc(doc(bobDb, 'artists', 'alice')))
  })

  it('a nonexistent artist id fails safely — an empty result, never a permission error', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertSucceeds(getDoc(doc(anonDb, 'artists', 'does-not-exist')))
  })

  it('a PENDING (not yet approved) seller is not publicly exposed — no profile was ever created for them', async () => {
    // No artists/{uid} document exists for a PENDING seller at all (only
    // promoteSeller.ts/reconcileRoles.ts ever create one, and only for an
    // APPROVED seller) — reading it is indistinguishable from any other
    // nonexistent id: an empty, successful result, not a data exposure.
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertSucceeds(getDoc(doc(anonDb, 'artists', 'pending-seller-uid')))
    const snap = await getDoc(doc(anonDb, 'artists', 'pending-seller-uid'))
    if (snap.exists()) throw new Error('expected no artist profile to exist for a PENDING seller')
  })
})

describe('artists/{artistId} rules — privacy boundary', () => {
  it('a public user cannot read private sellers/{uid} information', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'sellers', 'alice'), {
        uid: 'alice',
        status: 'APPROVED',
        businessName: 'Alice Fine Art',
        description: 'Oil paintings and limited-edition prints, made in Jaipur.',
        contactEmail: 'alice@example.test',
        appliedAt: 1,
        reviewedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      })
    })
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anonDb, 'sellers', 'alice')))
  })

  it('contactEmail (or any other private field) can never be written onto the public artist document at all', async () => {
    await seedProfile()
    const aliceDb = sellerContext('alice')
    await assertFails(
      updateDoc(doc(aliceDb, 'artists', 'alice'), {
        contactEmail: 'alice@example.test',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('a public (unauthenticated) user cannot modify an artist profile', async () => {
    await seedProfile()
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(
      updateDoc(doc(anonDb, 'artists', 'alice'), { displayName: 'Hijacked', updatedAt: serverTimestamp() }),
    )
  })

  it('a signed-in customer cannot modify an artist profile', async () => {
    await seedProfile()
    const customerDb = customerContext('mallory')
    await assertFails(
      updateDoc(doc(customerDb, 'artists', 'alice'), { displayName: 'Hijacked', updatedAt: serverTimestamp() }),
    )
  })

  it("another seller cannot modify this artist's profile", async () => {
    await seedProfile()
    const bobDb = sellerContext('bob')
    await assertFails(
      updateDoc(doc(bobDb, 'artists', 'alice'), { displayName: 'Hijacked', updatedAt: serverTimestamp() }),
    )
  })
})

describe('artists/{artistId} rules — creation is never client-reachable', () => {
  it('an approved SELLER cannot create their own artist profile directly', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(setDoc(doc(aliceDb, 'artists', 'alice'), validArtistProfile()))
  })

  it('a non-approved seller (no SELLER claim yet) cannot create or activate a public artist identity', async () => {
    const malloryDb = customerContext('mallory')
    await assertFails(setDoc(doc(malloryDb, 'artists', 'mallory'), validArtistProfile({ uid: 'mallory' })))
  })

  it('cannot create an artist identity for a different uid than one\'s own', async () => {
    const aliceDb = sellerContext('alice')
    await assertFails(setDoc(doc(aliceDb, 'artists', 'bob'), validArtistProfile({ uid: 'bob' })))
  })
})

describe('artists/{artistId} rules — owner self-service update', () => {
  it('the approved seller who owns this profile can update the permitted public fields', async () => {
    await seedProfile()
    const aliceDb = sellerContext('alice')
    await assertSucceeds(
      updateDoc(doc(aliceDb, 'artists', 'alice'), {
        displayName: 'Alice Fine Art Studio',
        bio: 'An updated public bio describing the studio in more detail.',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('cannot change the immutable uid field', async () => {
    await seedProfile()
    const aliceDb = sellerContext('alice')
    await assertFails(updateDoc(doc(aliceDb, 'artists', 'alice'), { uid: 'bob', updatedAt: serverTimestamp() }))
  })

  it('cannot change the immutable createdAt field', async () => {
    await seedProfile()
    const aliceDb = sellerContext('alice')
    await assertFails(
      updateDoc(doc(aliceDb, 'artists', 'alice'), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    )
  })

  it('rejects a display name that is too short', async () => {
    await seedProfile()
    const aliceDb = sellerContext('alice')
    await assertFails(updateDoc(doc(aliceDb, 'artists', 'alice'), { displayName: 'A', updatedAt: serverTimestamp() }))
  })

  it('rejects a bio that is too short', async () => {
    await seedProfile()
    const aliceDb = sellerContext('alice')
    await assertFails(updateDoc(doc(aliceDb, 'artists', 'alice'), { bio: 'short', updatedAt: serverTimestamp() }))
  })

  it('a CUSTOMER (no SELLER claim) cannot update even their own uid\'s artist document if one somehow existed', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'artists', 'mallory'), { ...EXISTING_PROFILE, uid: 'mallory' })
    })
    const malloryDb = customerContext('mallory')
    await assertFails(
      updateDoc(doc(malloryDb, 'artists', 'mallory'), { displayName: 'Hijacked', updatedAt: serverTimestamp() }),
    )
  })

  it('cannot delete an artist profile', async () => {
    await seedProfile()
    const aliceDb = sellerContext('alice')
    await assertFails(deleteDoc(doc(aliceDb, 'artists', 'alice')))
  })
})

describe('artists/{artistId} rules — artwork visibility is unchanged by this module', () => {
  it("a public visitor still cannot read a seller's SUBMITTED artwork — no artwork read path was opened by Module 06", async () => {
    let artworkId = ''
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const ref = doc(context.firestore(), 'artworks', 'public-boundary-check')
      await setDoc(ref, {
        sellerId: 'alice',
        title: 'Existing Submitted Artwork',
        description: 'A fixture proving Module 06 never opened artwork reads.',
        price: 100000,
        category: 'painting',
        tags: [],
        images: [],
        inventoryCount: 1,
        status: 'SUBMITTED',
        createdAt: 1,
        updatedAt: 1,
      })
      artworkId = ref.id
    })
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anonDb, 'artworks', artworkId)))
  })
})
