import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

// Requires the Firestore emulator running locally at 127.0.0.1:8080
// (`firebase emulators:start --only firestore`, which itself requires a
// JRE). Not part of `npm run test` — run separately via `npm run test:rules`
// once an emulator is up. See docs/SECURITY.md.

let testEnv: RulesTestEnvironment

const PROFILE = {
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
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users/alice'), PROFILE)
  })
})

describe('users/{uid} rules — read access', () => {
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
})

describe('users/{uid} rules — document lifecycle', () => {
  it('blocks a client from creating a profile document directly', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(aliceDb, 'users/carol'), { ...PROFILE, uid: 'carol' }))
  })

  it('blocks a client from deleting a profile document', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(deleteDoc(doc(aliceDb, 'users/alice')))
  })
})

// Every allowed write below includes updatedAt: serverTimestamp(), matching
// exactly what src/features/account/api/profileRepository.ts sends — the
// rule requires updatedAt to equal request.time (i.e. genuinely
// server-stamped), so a client-supplied Date/number is rejected too.
describe('users/{uid} rules — allowed profile edits', () => {
  it('allows a user to update their own display name', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(
      updateDoc(doc(aliceDb, 'users/alice'), { displayName: 'Alice Updated', updatedAt: serverTimestamp() }),
    )
  })

  it('allows a user to update their own phone number', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(
      updateDoc(doc(aliceDb, 'users/alice'), { phoneNumber: '+1 555 0100', updatedAt: serverTimestamp() }),
    )
  })

  it('allows a user to update their own bio', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(
      updateDoc(doc(aliceDb, 'users/alice'), {
        bio: 'Collector of contemporary sculpture.',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('allows a legitimate combined profile update matching the app write shape', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertSucceeds(
      updateDoc(doc(aliceDb, 'users/alice'), {
        displayName: 'Alice Updated',
        phoneNumber: '+1 555 0100',
        bio: 'Collector of contemporary sculpture.',
        profileCompleted: true,
        updatedAt: serverTimestamp(),
      }),
    )
  })
})

describe('users/{uid} rules — protected fields', () => {
  it('blocks a user from changing their own uid', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(updateDoc(doc(aliceDb, 'users/alice'), { uid: 'mallory', updatedAt: serverTimestamp() }))
  })

  it('blocks a user from escalating their own role', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(updateDoc(doc(aliceDb, 'users/alice'), { role: 'ADMIN', updatedAt: serverTimestamp() }))
  })

  it('blocks a user from changing their own email', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      updateDoc(doc(aliceDb, 'users/alice'), { email: 'mallory@example.com', updatedAt: serverTimestamp() }),
    )
  })

  it('blocks a user from changing createdAt', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(updateDoc(doc(aliceDb, 'users/alice'), { createdAt: 999, updatedAt: serverTimestamp() }))
  })

  it('blocks a user from injecting an unlisted privileged field', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(updateDoc(doc(aliceDb, 'users/alice'), { isAdmin: true, updatedAt: serverTimestamp() }))
  })

  it('blocks a user from writing admin/moderation metadata via mass assignment', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      updateDoc(doc(aliceDb, 'users/alice'), {
        suspended: true,
        sellerVerified: true,
        moderationStatus: 'cleared',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('blocks a malicious full-document overwrite from bypassing protected-field restrictions', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(aliceDb, 'users/alice'), {
        ...PROFILE,
        role: 'ADMIN',
        displayName: 'Alice Updated',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('blocks changing photoURL from the client (no avatar upload in this module)', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      updateDoc(doc(aliceDb, 'users/alice'), {
        photoURL: 'https://evil.example/x.png',
        updatedAt: serverTimestamp(),
      }),
    )
  })
})

describe('users/{uid} rules — schema validation', () => {
  it('rejects an empty display name', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(updateDoc(doc(aliceDb, 'users/alice'), { displayName: '', updatedAt: serverTimestamp() }))
  })

  it('rejects an oversized display name', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      updateDoc(doc(aliceDb, 'users/alice'), { displayName: 'x'.repeat(61), updatedAt: serverTimestamp() }),
    )
  })

  it('rejects an oversized bio', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(updateDoc(doc(aliceDb, 'users/alice'), { bio: 'x'.repeat(281), updatedAt: serverTimestamp() }))
  })

  it('rejects a non-boolean profileCompleted value', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(
      updateDoc(doc(aliceDb, 'users/alice'), { profileCompleted: 'yes', updatedAt: serverTimestamp() }),
    )
  })
})
