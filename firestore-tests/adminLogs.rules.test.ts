import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertIsolatedFirestoreTestEnvironment, TEST_PROJECT_ID } from '../test-support/emulatorTestEnv'

// Not part of `npm run test` — run via `npm run test:rules` (see
// artworks.rules.test.ts's own identical header comment for the full
// rationale) — never the real ArtVault development emulator.
//
// adminLogs/{logId} — the audit trail for trusted admin moderation actions
// (admin moderation override, UI-03 final correction). Every real document
// is written exclusively by the Admin-SDK-backed `suspendArtwork` callable
// (functions/src/moderateArtworkRemoval.ts), inside the same transaction as
// the moderation write itself — never by any client, admin included. These
// rules tests exist purely to prove the read/write boundary firestore.rules
// itself declares: admin-only read, write always denied for everyone.

let testEnv: RulesTestEnvironment

const EXISTING_LOG = {
  action: 'ARTWORK_SUSPENDED',
  artworkId: 'artwork-1',
  adminUid: 'admin-1',
  previousStatus: 'PUBLISHED',
  resultingStatus: 'SUSPENDED',
  reason: 'Reported for a policy violation.',
  createdAt: 1,
}

beforeAll(async () => {
  const { host, port } = assertIsolatedFirestoreTestEnvironment()
  testEnv = await initializeTestEnvironment({
    projectId: TEST_PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

function adminContext(uid: string) {
  return testEnv.authenticatedContext(uid, { role: 'ADMIN' }).firestore()
}

function superAdminContext(uid: string) {
  return testEnv.authenticatedContext(uid, { role: 'SUPER_ADMIN' }).firestore()
}

function sellerContext(uid: string) {
  return testEnv.authenticatedContext(uid, { role: 'SELLER' }).firestore()
}

function customerContext(uid: string) {
  return testEnv.authenticatedContext(uid, { role: 'CUSTOMER' }).firestore()
}

async function seedLog(): Promise<string> {
  let id = ''
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const ref = doc(collection(context.firestore(), 'adminLogs'))
    await setDoc(ref, EXISTING_LOG)
    id = ref.id
  })
  return id
}

describe('adminLogs/{logId} rules — read', () => {
  it('lets an ADMIN read an existing log entry', async () => {
    const id = await seedLog()
    await assertSucceeds(getDoc(doc(adminContext('admin-1'), 'adminLogs', id)))
  })

  it('lets a SUPER_ADMIN read an existing log entry', async () => {
    const id = await seedLog()
    await assertSucceeds(getDoc(doc(superAdminContext('super-1'), 'adminLogs', id)))
  })

  it('lets an ADMIN list the collection', async () => {
    await seedLog()
    await assertSucceeds(getDocs(collection(adminContext('admin-1'), 'adminLogs')))
  })

  it('blocks a SELLER from reading a log entry', async () => {
    const id = await seedLog()
    await assertFails(getDoc(doc(sellerContext('alice'), 'adminLogs', id)))
  })

  it('blocks a CUSTOMER from reading a log entry', async () => {
    const id = await seedLog()
    await assertFails(getDoc(doc(customerContext('mallory'), 'adminLogs', id)))
  })
})

describe('adminLogs/{logId} rules — write is always denied, admin included', () => {
  it('blocks an ADMIN from creating a log entry directly', async () => {
    await assertFails(addDoc(collection(adminContext('admin-1'), 'adminLogs'), EXISTING_LOG))
  })

  it('blocks an ADMIN from updating an existing log entry', async () => {
    const id = await seedLog()
    await assertFails(updateDoc(doc(adminContext('admin-1'), 'adminLogs', id), { reason: 'edited' }))
  })

  it('blocks an ADMIN from deleting a log entry', async () => {
    const id = await seedLog()
    await assertFails(deleteDoc(doc(adminContext('admin-1'), 'adminLogs', id)))
  })

  it('blocks a SELLER from creating a log entry', async () => {
    await assertFails(addDoc(collection(sellerContext('alice'), 'adminLogs'), EXISTING_LOG))
  })
})
