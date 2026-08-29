import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

// Requires the Firestore emulator running locally at 127.0.0.1:8080
// (`firebase emulators:start --only firestore`, which itself requires a
// JRE). Not part of `npm run test` — run separately via `npm run test:rules`
// once an emulator is up. See docs/SECURITY.md.

let testEnv: RulesTestEnvironment

const PROFILE = { uid: 'alice', email: 'alice@example.com', displayName: 'Alice', role: 'CUSTOMER', createdAt: 1 }

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
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users/alice'), PROFILE)
  })
})

describe('users/{uid} rules', () => {
  it('lets a user read their own profile', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(getDoc(doc(aliceDb, 'users/alice')))
  })

  it("blocks a user from reading someone else's profile", async () => {
    const bobDb = testEnv.authenticatedContext('bob').firestore()
    await assertFails(getDoc(doc(bobDb, 'users/alice')))
  })

  it('blocks an unauthenticated read', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anonDb, 'users/alice')))
  })

  it('blocks a client from creating a profile document directly', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(aliceDb, 'users/carol'), { ...PROFILE, uid: 'carol' }))
  })

  it('blocks a user from escalating their own role', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(updateDoc(doc(aliceDb, 'users/alice'), { role: 'ADMIN' }))
  })

  it('allows a user to update their own display name', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(updateDoc(doc(aliceDb, 'users/alice'), { displayName: 'Alice Updated' }))
  })
})
