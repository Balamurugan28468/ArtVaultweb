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

// Not part of `npm run test` — run via `npm run test:rules` (see
// wishlists.rules.test.ts for the full explanation of this isolated
// emulator setup, mirrored exactly here).

let testEnv: RulesTestEnvironment

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

describe('carts/{uid}/items/{artworkId} rules', () => {
  it('lets the owner create a cart item with a valid quantity and addedAt', async () => {
    const aliceDb = customerContext('alice')
    await assertSucceeds(
      setDoc(doc(aliceDb, 'carts', 'alice', 'items', 'a1'), { quantity: 1, addedAt: serverTimestamp() }),
    )
  })

  it('rejects a create missing quantity', async () => {
    const aliceDb = customerContext('alice')
    await assertFails(setDoc(doc(aliceDb, 'carts', 'alice', 'items', 'a1'), { addedAt: serverTimestamp() }))
  })

  it('rejects a create with quantity 0', async () => {
    const aliceDb = customerContext('alice')
    await assertFails(
      setDoc(doc(aliceDb, 'carts', 'alice', 'items', 'a1'), { quantity: 0, addedAt: serverTimestamp() }),
    )
  })

  it('rejects a create with a quantity above the sane ceiling', async () => {
    const aliceDb = customerContext('alice')
    await assertFails(
      setDoc(doc(aliceDb, 'carts', 'alice', 'items', 'a1'), { quantity: 100, addedAt: serverTimestamp() }),
    )
  })

  it('rejects a create with a non-integer quantity', async () => {
    const aliceDb = customerContext('alice')
    await assertFails(
      setDoc(doc(aliceDb, 'carts', 'alice', 'items', 'a1'), { quantity: 1.5, addedAt: serverTimestamp() }),
    )
  })

  it('rejects a create with an extra field beyond quantity/addedAt', async () => {
    const aliceDb = customerContext('alice')
    await assertFails(
      setDoc(doc(aliceDb, 'carts', 'alice', 'items', 'a1'), {
        quantity: 1,
        addedAt: serverTimestamp(),
        price: 500000,
      }),
    )
  })

  it('rejects a forged addedAt (not the server timestamp)', async () => {
    const aliceDb = customerContext('alice')
    await assertFails(setDoc(doc(aliceDb, 'carts', 'alice', 'items', 'a1'), { quantity: 1, addedAt: new Date() }))
  })

  it('rejects creating a cart item under a different uid than the caller', async () => {
    const aliceDb = customerContext('alice')
    await assertFails(
      setDoc(doc(aliceDb, 'carts', 'bob', 'items', 'a1'), { quantity: 1, addedAt: serverTimestamp() }),
    )
  })

  it('lets the owner read their own cart item', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'carts', 'alice', 'items', 'a1'), { quantity: 2, addedAt: 1 })
    })
    const aliceDb = customerContext('alice')
    await assertSucceeds(getDoc(doc(aliceDb, 'carts', 'alice', 'items', 'a1')))
  })

  it('denies another signed-in user from reading someone else’s cart', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'carts', 'alice', 'items', 'a1'), { quantity: 1, addedAt: 1 })
    })
    const bobDb = customerContext('bob')
    await assertFails(getDoc(doc(bobDb, 'carts', 'alice', 'items', 'a1')))
  })

  it('denies a signed-out visitor from reading or creating a cart item', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'carts', 'alice', 'items', 'a1'), { quantity: 1, addedAt: 1 })
    })
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anonDb, 'carts', 'alice', 'items', 'a1')))
    await assertFails(setDoc(doc(anonDb, 'carts', 'alice', 'items', 'a2'), { quantity: 1, addedAt: serverTimestamp() }))
  })

  it('lets the owner update only the quantity of an existing cart item', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'carts', 'alice', 'items', 'a1'), { quantity: 1, addedAt: 1 })
    })
    const aliceDb = customerContext('alice')
    await assertSucceeds(updateDoc(doc(aliceDb, 'carts', 'alice', 'items', 'a1'), { quantity: 3, addedAt: 1 }))
  })

  it('rejects an update that changes addedAt', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'carts', 'alice', 'items', 'a1'), { quantity: 1, addedAt: 1 })
    })
    const aliceDb = customerContext('alice')
    await assertFails(updateDoc(doc(aliceDb, 'carts', 'alice', 'items', 'a1'), { quantity: 3, addedAt: serverTimestamp() }))
  })

  it('rejects an update with an out-of-range quantity', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'carts', 'alice', 'items', 'a1'), { quantity: 1, addedAt: 1 })
    })
    const aliceDb = customerContext('alice')
    await assertFails(updateDoc(doc(aliceDb, 'carts', 'alice', 'items', 'a1'), { quantity: 0, addedAt: 1 }))
  })

  it('lets the owner delete their own cart item', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'carts', 'alice', 'items', 'a1'), { quantity: 1, addedAt: 1 })
    })
    const aliceDb = customerContext('alice')
    await assertSucceeds(deleteDoc(doc(aliceDb, 'carts', 'alice', 'items', 'a1')))
  })

  it('denies another user from deleting someone else’s cart item', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'carts', 'alice', 'items', 'a1'), { quantity: 1, addedAt: 1 })
    })
    const bobDb = customerContext('bob')
    await assertFails(deleteDoc(doc(bobDb, 'carts', 'alice', 'items', 'a1')))
  })
})
