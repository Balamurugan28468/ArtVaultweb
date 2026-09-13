import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
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

const SAMPLE_ORDER = {
  buyerId: 'alice',
  status: 'CREATED',
  subtotal: 500000,
  total: 500000,
  createdAt: 1,
}

describe('orders/{orderId} rules (read-only foundation)', () => {
  it('lets the buyer read their own order', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'orders', 'o1'), SAMPLE_ORDER)
    })
    const aliceDb = customerContext('alice')
    await assertSucceeds(getDoc(doc(aliceDb, 'orders', 'o1')))
  })

  it('denies a different signed-in user from reading someone else’s order', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'orders', 'o1'), SAMPLE_ORDER)
    })
    const bobDb = customerContext('bob')
    await assertFails(getDoc(doc(bobDb, 'orders', 'o1')))
  })

  it('denies a signed-out visitor from reading any order', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'orders', 'o1'), SAMPLE_ORDER)
    })
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anonDb, 'orders', 'o1')))
  })

  // No client write path exists for orders anywhere in this codebase yet —
  // order creation/status changes are reserved entirely for a future
  // trusted server operation (see firestore.rules' own comment on this
  // match block). These three assertions prove that isn't accidental: even
  // the buyer named in the document cannot create, update, or delete it.
  it('denies the named buyer from creating an order themselves', async () => {
    const aliceDb = customerContext('alice')
    await assertFails(setDoc(doc(aliceDb, 'orders', 'o1'), SAMPLE_ORDER))
  })

  it('denies the buyer from updating their own order (e.g. forging a status)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'orders', 'o1'), SAMPLE_ORDER)
    })
    const aliceDb = customerContext('alice')
    await assertFails(updateDoc(doc(aliceDb, 'orders', 'o1'), { status: 'DELIVERED' }))
  })

  it('denies the buyer from deleting their own order', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'orders', 'o1'), SAMPLE_ORDER)
    })
    const aliceDb = customerContext('alice')
    await assertFails(deleteDoc(doc(aliceDb, 'orders', 'o1')))
  })
})

describe('orders/{orderId}/items/{itemId} rules (read-only foundation)', () => {
  const SAMPLE_ITEM = { artworkId: 'art1', title: 'Snapshot title', unitPrice: 500000, quantity: 1 }

  it('lets the order’s buyer read an order item', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'orders', 'o1'), SAMPLE_ORDER)
      await setDoc(doc(context.firestore(), 'orders', 'o1', 'items', 'i1'), SAMPLE_ITEM)
    })
    const aliceDb = customerContext('alice')
    await assertSucceeds(getDoc(doc(aliceDb, 'orders', 'o1', 'items', 'i1')))
  })

  it('denies a different signed-in user from reading another buyer’s order item', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'orders', 'o1'), SAMPLE_ORDER)
      await setDoc(doc(context.firestore(), 'orders', 'o1', 'items', 'i1'), SAMPLE_ITEM)
    })
    const bobDb = customerContext('bob')
    await assertFails(getDoc(doc(bobDb, 'orders', 'o1', 'items', 'i1')))
  })

  it('denies any client write to an order item, including the buyer', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'orders', 'o1'), SAMPLE_ORDER)
    })
    const aliceDb = customerContext('alice')
    await assertFails(setDoc(doc(aliceDb, 'orders', 'o1', 'items', 'i1'), SAMPLE_ITEM))
  })
})
