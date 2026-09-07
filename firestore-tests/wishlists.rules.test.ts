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
// instance instead — see test-support/emulatorTestEnv.ts.

let testEnv: RulesTestEnvironment

const OTHER_SELLER_DRAFT = {
  sellerId: 'bob',
  title: 'Bob’s private draft',
  description: 'A draft artwork that must never become readable via a wishlist entry.',
  price: 100000,
  category: 'painting',
  tags: [],
  images: [],
  inventoryCount: 1,
  status: 'DRAFT',
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

function customerContext(uid: string) {
  return testEnv.authenticatedContext(uid, { role: 'CUSTOMER' }).firestore()
}

describe('wishlists/{uid}/items/{artworkId} rules', () => {
  it('lets the owner create a wishlist item with only addedAt', async () => {
    const aliceDb = customerContext('alice')
    await assertSucceeds(
      setDoc(doc(aliceDb, 'wishlists', 'alice', 'items', 'a1'), { addedAt: serverTimestamp() }),
    )
  })

  it('rejects a create missing addedAt', async () => {
    const aliceDb = customerContext('alice')
    await assertFails(setDoc(doc(aliceDb, 'wishlists', 'alice', 'items', 'a1'), {}))
  })

  it('rejects a create with an extra field beyond addedAt', async () => {
    const aliceDb = customerContext('alice')
    await assertFails(
      setDoc(doc(aliceDb, 'wishlists', 'alice', 'items', 'a1'), {
        addedAt: serverTimestamp(),
        note: 'sneaking in an extra field',
      }),
    )
  })

  it('rejects a forged addedAt (not the server timestamp)', async () => {
    const aliceDb = customerContext('alice')
    await assertFails(setDoc(doc(aliceDb, 'wishlists', 'alice', 'items', 'a1'), { addedAt: new Date() }))
  })

  it('rejects creating a wishlist item under a different uid than the caller', async () => {
    const aliceDb = customerContext('alice')
    await assertFails(setDoc(doc(aliceDb, 'wishlists', 'bob', 'items', 'a1'), { addedAt: serverTimestamp() }))
  })

  it('lets the owner read their own wishlist item', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'wishlists', 'alice', 'items', 'a1'), { addedAt: 1 })
    })
    const aliceDb = customerContext('alice')
    await assertSucceeds(getDoc(doc(aliceDb, 'wishlists', 'alice', 'items', 'a1')))
  })

  it('denies another signed-in user from reading someone else’s wishlist', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'wishlists', 'alice', 'items', 'a1'), { addedAt: 1 })
    })
    const bobDb = customerContext('bob')
    await assertFails(getDoc(doc(bobDb, 'wishlists', 'alice', 'items', 'a1')))
  })

  it('denies a signed-out visitor from reading any wishlist', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'wishlists', 'alice', 'items', 'a1'), { addedAt: 1 })
    })
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anonDb, 'wishlists', 'alice', 'items', 'a1')))
  })

  it('denies a signed-out visitor from creating a wishlist item', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(setDoc(doc(anonDb, 'wishlists', 'alice', 'items', 'a1'), { addedAt: serverTimestamp() }))
  })

  it('lets the owner delete their own wishlist item', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'wishlists', 'alice', 'items', 'a1'), { addedAt: 1 })
    })
    const aliceDb = customerContext('alice')
    await assertSucceeds(deleteDoc(doc(aliceDb, 'wishlists', 'alice', 'items', 'a1')))
  })

  it('denies another user from deleting someone else’s wishlist item', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'wishlists', 'alice', 'items', 'a1'), { addedAt: 1 })
    })
    const bobDb = customerContext('bob')
    await assertFails(deleteDoc(doc(bobDb, 'wishlists', 'alice', 'items', 'a1')))
  })

  it('never allows an update — a saved item is only ever created or deleted', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'wishlists', 'alice', 'items', 'a1'), { addedAt: 1 })
    })
    const aliceDb = customerContext('alice')
    await assertFails(updateDoc(doc(aliceDb, 'wishlists', 'alice', 'items', 'a1'), { addedAt: serverTimestamp() }))
  })

  it('a guessed/forged private artwork id in a wishlist entry never becomes readable through it — existing artwork rules stay authoritative', async () => {
    let artworkId = ''
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const ref = await context.firestore().collection('artworks').add(OTHER_SELLER_DRAFT)
      artworkId = ref.id
      // Alice references bob's private DRAFT artwork id in her own wishlist
      // — the wishlist write itself only ever needs to be valid on its own
      // terms (owner uid, addedAt only), never anything about the artwork.
      await setDoc(doc(context.firestore(), 'wishlists', 'alice', 'items', artworkId), { addedAt: 1 })
    })

    const aliceDb = customerContext('alice')
    // Alice can read her own wishlist entry (just an id + timestamp — no
    // artwork data at all)...
    await assertSucceeds(getDoc(doc(aliceDb, 'wishlists', 'alice', 'items', artworkId)))
    // ...but resolving what that id actually refers to still goes through
    // artworks/{artworkId}'s own unmodified, pre-existing rule, which is
    // still exactly as strict as it always was: DRAFT is owner-only, and
    // alice is not bob.
    await assertFails(getDoc(doc(aliceDb, 'artworks', artworkId)))
  })
})
