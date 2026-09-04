import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

// Requires the Firestore emulator running locally at 127.0.0.1:8080. Not
// part of `npm run test` — run separately via `npm run test:rules` once an
// emulator is up. See docs/SECURITY.md.

let testEnv: RulesTestEnvironment

function validApplication(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'alice',
    status: 'PENDING',
    businessName: 'Alice Fine Art',
    description: 'Contemporary landscape paintings in oil and acrylic.',
    contactEmail: 'alice@example.com',
    appliedAt: serverTimestamp(),
    reviewedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  }
}

const EXISTING_APPLICATION = {
  uid: 'alice',
  status: 'PENDING',
  businessName: 'Alice Fine Art',
  description: 'desc',
  contactEmail: 'alice@example.com',
  appliedAt: 1,
  reviewedAt: null,
  createdAt: 1,
  updatedAt: 1,
}

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

describe('sellers/{uid} rules — application submission', () => {
  it('blocks an unauthenticated application', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(setDoc(doc(anonDb, 'sellers/alice'), validApplication()))
  })

  it('allows an authenticated user to submit their own application', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(setDoc(doc(aliceDb, 'sellers/alice'), validApplication()))
  })

  it("blocks writing to another user's application path", async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(aliceDb, 'sellers/bob'), validApplication({ uid: 'bob' })))
  })

  it('blocks a forged uid field mismatching the document path (even at your own path)', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(aliceDb, 'sellers/alice'), validApplication({ uid: 'bob' })))
  })

  it('forces status to PENDING regardless of what the client sends', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(aliceDb, 'sellers/alice'), validApplication({ status: 'APPROVED' })))
  })

  it('rejects a business name that is too short', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(aliceDb, 'sellers/alice'), validApplication({ businessName: 'A' })))
  })

  it('rejects a description that is too short', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(aliceDb, 'sellers/alice'), validApplication({ description: 'short' })))
  })

  it('rejects a non-null reviewedAt on submission', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(aliceDb, 'sellers/alice'), validApplication({ reviewedAt: serverTimestamp() })))
  })
})

describe('sellers/{uid} rules — read access', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'sellers/alice'), EXISTING_APPLICATION)
    })
  })

  it('lets the applicant read their own application', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(getDoc(doc(aliceDb, 'sellers/alice')))
  })

  it("blocks another authenticated user from reading someone else's private application", async () => {
    const bobDb = testEnv.authenticatedContext('bob').firestore()
    await assertFails(getDoc(doc(bobDb, 'sellers/alice')))
  })

  it('blocks an unauthenticated read', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anonDb, 'sellers/alice')))
  })
})

describe('sellers/{uid} rules — no client modification after submission', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'sellers/alice'), EXISTING_APPLICATION)
    })
  })

  it('blocks the applicant from setting their own status to APPROVED', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(updateDoc(doc(aliceDb, 'sellers/alice'), { status: 'APPROVED' }))
  })

  it('blocks a duplicate application attempt against an existing application (still PENDING)', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(aliceDb, 'sellers/alice'), validApplication({ businessName: 'New Name' })))
  })

  it('blocks the applicant from deleting their own application', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(deleteDoc(doc(aliceDb, 'sellers/alice')))
  })

  it("blocks any edit to another user's application", async () => {
    const bobDb = testEnv.authenticatedContext('bob').firestore()
    await assertFails(updateDoc(doc(bobDb, 'sellers/alice'), { businessName: 'Hijacked' }))
  })
})

describe('sellers/{uid} rules — SELLER privilege escalation stays impossible', () => {
  it('does not let the client set role=SELLER on users/{uid} directly, application or not', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/alice'), {
        uid: 'alice',
        email: 'alice@example.com',
        displayName: 'Alice',
        photoURL: null,
        role: 'CUSTOMER',
        phoneNumber: null,
        bio: null,
        profileCompleted: false,
        createdAt: 1,
        updatedAt: 1,
      })
      await setDoc(doc(context.firestore(), 'sellers/alice'), { ...EXISTING_APPLICATION, status: 'APPROVED' })
    })

    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(updateDoc(doc(aliceDb, 'users/alice'), { role: 'SELLER', updatedAt: serverTimestamp() }))
  })
})
