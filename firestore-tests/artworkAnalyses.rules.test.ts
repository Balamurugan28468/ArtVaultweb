import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertIsolatedFirestoreTestEnvironment, TEST_PROJECT_ID } from '../test-support/emulatorTestEnv'

// Not part of `npm run test` — run via `npm run test:rules` (see
// artworks.rules.test.ts's own identical header comment for the full
// rationale) — never the real ArtVault development emulator.
//
// artworkAnalyses/{artworkId} — UI-05's read-only foundation, same
// posture as auctions/{auctionId} (UI-04). No AI gateway Cloud Function
// exists yet to ever populate this (see docs/AI_ARCHITECTURE.md), so
// write is denied unconditionally for everyone, admin included. Read is
// public (same posture as a PUBLISHED artwork/auction).

let testEnv: RulesTestEnvironment

const EXISTING_ANALYSIS = {
  artworkId: 'artwork-1',
  artisticScorePercent: 92,
  style: 'Post-Impressionism',
  notableElements: ['Dynamic brushwork'],
  createdAt: 1,
  updatedAt: 1,
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

function sellerContext(uid: string) {
  return testEnv.authenticatedContext(uid, { role: 'SELLER' }).firestore()
}

function customerContext(uid: string) {
  return testEnv.authenticatedContext(uid, { role: 'CUSTOMER' }).firestore()
}

function guestContext() {
  return testEnv.unauthenticatedContext().firestore()
}

async function seedAnalysis(): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'artworkAnalyses', 'artwork-1'), EXISTING_ANALYSIS)
  })
}

describe('artworkAnalyses/{artworkId} rules — read is public', () => {
  it('lets a signed-out guest read an existing analysis', async () => {
    await seedAnalysis()
    await assertSucceeds(getDoc(doc(guestContext(), 'artworkAnalyses', 'artwork-1')))
  })

  it('lets a signed-out guest list the collection', async () => {
    await seedAnalysis()
    await assertSucceeds(getDocs(collection(guestContext(), 'artworkAnalyses')))
  })

  it('lets a CUSTOMER read an existing analysis', async () => {
    await seedAnalysis()
    await assertSucceeds(getDoc(doc(customerContext('carol'), 'artworkAnalyses', 'artwork-1')))
  })

  it('lets an ADMIN read an existing analysis', async () => {
    await seedAnalysis()
    await assertSucceeds(getDoc(doc(adminContext('admin-1'), 'artworkAnalyses', 'artwork-1')))
  })
})

describe('artworkAnalyses/{artworkId} rules — write is always denied, admin included', () => {
  it('blocks a guest from creating an analysis', async () => {
    await assertFails(addDoc(collection(guestContext(), 'artworkAnalyses'), EXISTING_ANALYSIS))
  })

  it('blocks a CUSTOMER from creating an analysis', async () => {
    await assertFails(addDoc(collection(customerContext('carol'), 'artworkAnalyses'), EXISTING_ANALYSIS))
  })

  it('blocks a SELLER from creating an analysis, even for their own artwork', async () => {
    await assertFails(addDoc(collection(sellerContext('alice'), 'artworkAnalyses'), EXISTING_ANALYSIS))
  })

  it('blocks an ADMIN from creating an analysis directly', async () => {
    await assertFails(addDoc(collection(adminContext('admin-1'), 'artworkAnalyses'), EXISTING_ANALYSIS))
  })

  it('blocks an ADMIN from updating an existing analysis', async () => {
    await seedAnalysis()
    await assertFails(updateDoc(doc(adminContext('admin-1'), 'artworkAnalyses', 'artwork-1'), { artisticScorePercent: 99 }))
  })

  it('blocks a SELLER from deleting an analysis of their own artwork', async () => {
    await seedAnalysis()
    await assertFails(deleteDoc(doc(sellerContext('seller-1'), 'artworkAnalyses', 'artwork-1')))
  })
})
