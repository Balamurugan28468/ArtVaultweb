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

function validAddress(overrides: Record<string, unknown> = {}) {
  return {
    fullName: 'Ada Lovelace',
    addressLine1: '12 Analytical Ave',
    addressLine2: '',
    city: 'London',
    state: 'London',
    postalCode: 'SW1A 1AA',
    country: 'UK',
    phone: '',
    isDefault: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  }
}

describe('addresses/{uid}/entries/{addressId} rules', () => {
  it('lets the owner create a well-formed address', async () => {
    const aliceDb = customerContext('alice')
    await assertSucceeds(setDoc(doc(aliceDb, 'addresses', 'alice', 'entries', 'a1'), validAddress()))
  })

  it('rejects a create missing a required field', async () => {
    const aliceDb = customerContext('alice')
    const { fullName: _fullName, ...withoutFullName } = validAddress()
    await assertFails(setDoc(doc(aliceDb, 'addresses', 'alice', 'entries', 'a1'), withoutFullName))
  })

  it('rejects a create with an extra, unexpected field', async () => {
    const aliceDb = customerContext('alice')
    await assertFails(
      setDoc(doc(aliceDb, 'addresses', 'alice', 'entries', 'a1'), validAddress({ landmark: 'Near the park' })),
    )
  })

  it('rejects a create with a forged createdAt (not the server timestamp)', async () => {
    const aliceDb = customerContext('alice')
    await assertFails(
      setDoc(doc(aliceDb, 'addresses', 'alice', 'entries', 'a1'), validAddress({ createdAt: new Date() })),
    )
  })

  it('rejects a create with a forged updatedAt (not the server timestamp)', async () => {
    const aliceDb = customerContext('alice')
    await assertFails(
      setDoc(doc(aliceDb, 'addresses', 'alice', 'entries', 'a1'), validAddress({ updatedAt: new Date() })),
    )
  })

  it('rejects a create with isDefault as a non-boolean value', async () => {
    const aliceDb = customerContext('alice')
    await assertFails(
      setDoc(doc(aliceDb, 'addresses', 'alice', 'entries', 'a1'), validAddress({ isDefault: 'yes' })),
    )
  })

  it('rejects creating an address under a different uid than the caller', async () => {
    const aliceDb = customerContext('alice')
    await assertFails(setDoc(doc(aliceDb, 'addresses', 'bob', 'entries', 'a1'), validAddress()))
  })

  it('lets the owner read their own address', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'addresses', 'alice', 'entries', 'a1'), validAddress())
    })
    const aliceDb = customerContext('alice')
    await assertSucceeds(getDoc(doc(aliceDb, 'addresses', 'alice', 'entries', 'a1')))
  })

  it('denies another signed-in user from reading someone else’s address', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'addresses', 'alice', 'entries', 'a1'), validAddress())
    })
    const bobDb = customerContext('bob')
    await assertFails(getDoc(doc(bobDb, 'addresses', 'alice', 'entries', 'a1')))
  })

  it('denies a signed-out visitor from reading or creating an address', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'addresses', 'alice', 'entries', 'a1'), validAddress())
    })
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anonDb, 'addresses', 'alice', 'entries', 'a1')))
    await assertFails(setDoc(doc(anonDb, 'addresses', 'alice', 'entries', 'a2'), validAddress()))
  })

  it('lets the owner edit their own address, with a fresh updatedAt', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'addresses', 'alice', 'entries', 'a1'), validAddress())
    })
    const aliceDb = customerContext('alice')
    // A real edit only ever sends the changed fields plus a fresh
    // updatedAt (see AddressFormModal -> updateAddress, a `set(..., {
    // merge: true })`) — never a fresh createdAt, which would collide with
    // this rule's own immutability check below.
    await assertSucceeds(
      updateDoc(doc(aliceDb, 'addresses', 'alice', 'entries', 'a1'), { city: 'Manchester', updatedAt: serverTimestamp() }),
    )
  })

  it('lets the owner toggle isDefault alone (the "set default" batch pattern)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'addresses', 'alice', 'entries', 'a1'), validAddress())
    })
    const aliceDb = customerContext('alice')
    await assertSucceeds(
      updateDoc(doc(aliceDb, 'addresses', 'alice', 'entries', 'a1'), { isDefault: true, updatedAt: serverTimestamp() }),
    )
  })

  it('rejects an update that changes createdAt — immutable once set', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'addresses', 'alice', 'entries', 'a1'), validAddress())
    })
    const aliceDb = customerContext('alice')
    await assertFails(
      updateDoc(
        doc(aliceDb, 'addresses', 'alice', 'entries', 'a1'),
        validAddress({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
      ),
    )
  })

  it('rejects an update that omits updatedAt == request.time', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'addresses', 'alice', 'entries', 'a1'), validAddress())
    })
    const aliceDb = customerContext('alice')
    await assertFails(updateDoc(doc(aliceDb, 'addresses', 'alice', 'entries', 'a1'), { city: 'Manchester' }))
  })

  it('rejects an update from another user', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'addresses', 'alice', 'entries', 'a1'), validAddress())
    })
    const bobDb = customerContext('bob')
    await assertFails(
      updateDoc(doc(bobDb, 'addresses', 'alice', 'entries', 'a1'), { isDefault: true, updatedAt: serverTimestamp() }),
    )
  })

  it('lets the owner delete their own address', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'addresses', 'alice', 'entries', 'a1'), validAddress())
    })
    const aliceDb = customerContext('alice')
    await assertSucceeds(deleteDoc(doc(aliceDb, 'addresses', 'alice', 'entries', 'a1')))
  })

  it('denies another user from deleting someone else’s address', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'addresses', 'alice', 'entries', 'a1'), validAddress())
    })
    const bobDb = customerContext('bob')
    await assertFails(deleteDoc(doc(bobDb, 'addresses', 'alice', 'entries', 'a1')))
  })
})
