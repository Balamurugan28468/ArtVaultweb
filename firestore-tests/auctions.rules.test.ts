import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertIsolatedFirestoreTestEnvironment, TEST_PROJECT_ID } from '../test-support/emulatorTestEnv'

// Not part of `npm run test` — run via `npm run test:rules` (see
// artworks.rules.test.ts's own identical header comment for the full
// rationale) — never the real ArtVault development emulator.
//
// auctions/{auctionId} — UI-04's read-only foundation. No trusted server
// operation exists yet to create an auction, place a bid, or finalize one
// (see docs/AUCTION_ARCHITECTURE.md), so — exactly like orders/{orderId} —
// write is denied unconditionally for everyone, admin included. Read is
// public (same posture as a PUBLISHED artwork). The bids subcollection is
// fully closed on both read and write, since the public-vs-private bid
// projection is explicitly undecided until real bidding is built (see
// docs/DATABASE.md).

let testEnv: RulesTestEnvironment

const EXISTING_AUCTION = {
  artworkId: 'artwork-1',
  sellerId: 'seller-1',
  startAt: 1,
  endAt: 2,
  startingBid: 500000,
  bidIncrement: 10000,
  currentHighBid: null,
  bidCount: 0,
  winnerUid: null,
  winningBidAmount: null,
  createdAt: 1,
  updatedAt: 1,
}

const EXISTING_BID = {
  amount: 510000,
  placedAt: 1,
  bidderUid: 'customer-1',
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

async function seedAuction(): Promise<string> {
  let id = ''
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const ref = doc(collection(context.firestore(), 'auctions'))
    await setDoc(ref, EXISTING_AUCTION)
    id = ref.id
  })
  return id
}

async function seedBid(auctionId: string): Promise<string> {
  let id = ''
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const ref = doc(collection(context.firestore(), 'auctions', auctionId, 'bids'))
    await setDoc(ref, EXISTING_BID)
    id = ref.id
  })
  return id
}

describe('auctions/{auctionId} rules — read is public', () => {
  it('lets a signed-out guest read an existing auction', async () => {
    const id = await seedAuction()
    await assertSucceeds(getDoc(doc(guestContext(), 'auctions', id)))
  })

  it('lets a signed-out guest list the collection', async () => {
    await seedAuction()
    await assertSucceeds(getDocs(collection(guestContext(), 'auctions')))
  })

  it('lets a CUSTOMER read an existing auction', async () => {
    const id = await seedAuction()
    await assertSucceeds(getDoc(doc(customerContext('carol'), 'auctions', id)))
  })

  it('lets a SELLER read an existing auction', async () => {
    const id = await seedAuction()
    await assertSucceeds(getDoc(doc(sellerContext('alice'), 'auctions', id)))
  })

  it('lets an ADMIN read an existing auction', async () => {
    const id = await seedAuction()
    await assertSucceeds(getDoc(doc(adminContext('admin-1'), 'auctions', id)))
  })
})

describe('auctions/{auctionId} rules — write is always denied, admin included', () => {
  it('blocks a guest from creating an auction', async () => {
    await assertFails(addDoc(collection(guestContext(), 'auctions'), EXISTING_AUCTION))
  })

  it('blocks a CUSTOMER from creating an auction', async () => {
    await assertFails(addDoc(collection(customerContext('carol'), 'auctions'), EXISTING_AUCTION))
  })

  it('blocks a SELLER from creating an auction, even for their own artwork', async () => {
    await assertFails(addDoc(collection(sellerContext('alice'), 'auctions'), { ...EXISTING_AUCTION, sellerId: 'alice' }))
  })

  it('blocks an ADMIN from creating an auction directly', async () => {
    await assertFails(addDoc(collection(adminContext('admin-1'), 'auctions'), EXISTING_AUCTION))
  })

  it('blocks an ADMIN from updating an existing auction (e.g. placing a bid client-side)', async () => {
    const id = await seedAuction()
    await assertFails(updateDoc(doc(adminContext('admin-1'), 'auctions', id), { currentHighBid: 600000 }))
  })

  it('blocks a SELLER from deleting their own auction', async () => {
    const id = await seedAuction()
    await assertFails(deleteDoc(doc(sellerContext('seller-1'), 'auctions', id)))
  })
})

describe('auctions/{auctionId}/bids/{bidId} rules — fully closed (privacy split undecided)', () => {
  it('blocks a CUSTOMER from reading the bids subcollection', async () => {
    const auctionId = await seedAuction()
    const bidId = await seedBid(auctionId)
    await assertFails(getDoc(doc(customerContext('carol'), 'auctions', auctionId, 'bids', bidId)))
  })

  it('blocks the seller of the auction from reading the bids subcollection', async () => {
    const auctionId = await seedAuction()
    const bidId = await seedBid(auctionId)
    await assertFails(getDoc(doc(sellerContext('seller-1'), 'auctions', auctionId, 'bids', bidId)))
  })

  it('blocks an ADMIN from reading the bids subcollection', async () => {
    const auctionId = await seedAuction()
    const bidId = await seedBid(auctionId)
    await assertFails(getDoc(doc(adminContext('admin-1'), 'auctions', auctionId, 'bids', bidId)))
  })

  it('blocks a CUSTOMER from placing a bid directly', async () => {
    const auctionId = await seedAuction()
    await assertFails(addDoc(collection(customerContext('carol'), 'auctions', auctionId, 'bids'), EXISTING_BID))
  })
})
