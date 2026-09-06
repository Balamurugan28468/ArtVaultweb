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

// Coverage for ensureUserProfile.ts's client-triggered, idempotent
// canonical-profile self-healing: a real, permanent fix for Firebase Auth
// users existing with no matching users/{uid} document (previously only
// ever fixable by a trusted operator script). These tests attack the rule
// directly, the same way the recovery client would exercise it — no
// document exists yet for the uid under test in this describe block.
describe('users/{uid} rules — self-provisioning a missing profile (ensureUserProfile)', () => {
  // The rules-unit-testing emulator's fake ID token only carries whatever
  // claims are explicitly passed here — unlike a real Firebase ID token for
  // an email/password account, which always includes `email` — so every
  // context below supplies it explicitly to match production reality.
  function daveContext(claims: Record<string, unknown> = {}) {
    return testEnv.authenticatedContext('dave', { email: 'dave@example.com', ...claims }).firestore()
  }

  function newProfilePayload(overrides: Record<string, unknown> = {}) {
    return {
      uid: 'dave',
      email: 'dave@example.com',
      displayName: 'Dave',
      photoURL: null,
      role: 'CUSTOMER',
      phoneNumber: null,
      bio: null,
      profileCompleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...overrides,
    }
  }

  it('allows a user with no role claim yet to create their own missing profile as CUSTOMER', async () => {
    await assertSucceeds(setDoc(doc(daveContext(), 'users/dave'), newProfilePayload()))
  })

  it('allows a user with a trusted SELLER claim to self-heal, preserving SELLER (never downgrading to CUSTOMER)', async () => {
    await assertSucceeds(setDoc(doc(daveContext({ role: 'SELLER' }), 'users/dave'), newProfilePayload({ role: 'SELLER' })))
  })

  it('blocks a CUSTOMER (no claim) from self-creating a profile with role SELLER', async () => {
    await assertFails(setDoc(doc(daveContext(), 'users/dave'), newProfilePayload({ role: 'SELLER' })))
  })

  it('blocks a SELLER from self-creating a profile with role ADMIN', async () => {
    await assertFails(setDoc(doc(daveContext({ role: 'SELLER' }), 'users/dave'), newProfilePayload({ role: 'ADMIN' })))
  })

  it('blocks self-creation with a spoofed uid, even at the caller’s own document path', async () => {
    await assertFails(setDoc(doc(daveContext(), 'users/dave'), newProfilePayload({ uid: 'mallory' })))
  })

  it('blocks self-creation with a spoofed email not matching the authenticated identity', async () => {
    await assertFails(setDoc(doc(daveContext(), 'users/dave'), newProfilePayload({ email: 'mallory@example.com' })))
  })

  it('blocks self-creation with a non-null photoURL', async () => {
    await assertFails(
      setDoc(doc(daveContext(), 'users/dave'), newProfilePayload({ photoURL: 'https://evil.example/x.png' })),
    )
  })

  it('blocks self-creation with profileCompleted already true', async () => {
    await assertFails(setDoc(doc(daveContext(), 'users/dave'), newProfilePayload({ profileCompleted: true })))
  })

  it('blocks self-creation with a backdated createdAt (not a genuine server timestamp)', async () => {
    await assertFails(setDoc(doc(daveContext(), 'users/dave'), newProfilePayload({ createdAt: 1 })))
  })

  it('blocks self-creation with an unsupported role value', async () => {
    await assertFails(setDoc(doc(daveContext(), 'users/dave'), newProfilePayload({ role: 'SUPER_VILLAIN' })))
  })

  it('blocks an unauthenticated self-provisioning attempt', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore()
    await assertFails(setDoc(doc(anonDb, 'users/dave'), newProfilePayload()))
  })

  it("never lets this create path overwrite an existing profile — evaluated as update instead, and denied", async () => {
    // alice/PROFILE already exists (seeded in beforeEach). Attempting a
    // full-document "recreate" that changes role is denied by
    // isValidProfileUpdate, not isValidUserCreate — Firestore treats any
    // write to an existing document as an update regardless of intent.
    const aliceDb = testEnv.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(aliceDb, 'users/alice'), newProfilePayload({ uid: 'alice', email: 'alice@example.com' })))
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
