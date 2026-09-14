// UI-04 manual-testing helper ONLY — never imported by the app itself.
// Seeds exactly 3 real auction documents (one SCHEDULED, one LIVE, one
// ENDED-with-a-winner) into the *already-running* dev Firebase emulator, so
// an owner can manually click through all three AuctionDetailPage states
// without waiting for a real trusted auction-creation operation to exist
// (see docs/AUCTION_ARCHITECTURE.md — none does yet). Uses the Admin SDK,
// which — exactly like every other local operator script in this project
// (functions/src/setAdminClaim.ts etc.) — bypasses firestore.rules
// entirely; this is the one sanctioned way to write to `auctions` today,
// since firestore.rules itself denies every client write unconditionally.
//
// Each seeded auction links to a REAL PUBLISHED artwork already in your
// emulator (queried live, never hardcoded) — if fewer than 3 exist, the
// same artwork is reused across auctions rather than failing; if none
// exist, this script explains that and exits without writing anything
// (never a fabricated artworkId pointing at nothing).
//
// Usage (with the dev emulator already running via `npm run emulators`,
// from the `functions/` directory so firebase-admin resolves):
//   cd functions && node scripts/seed-auctions.mjs
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
initializeApp({ projectId: 'demo-artvault' })
const db = getFirestore()

async function main() {
  const snapshot = await db.collection('artworks').where('status', '==', 'PUBLISHED').limit(3).get()
  if (snapshot.empty) {
    console.error(
      'No PUBLISHED artworks found in the emulator — publish at least one real artwork first (Seller Studio → ' +
        'create + submit + admin-approve), then re-run this script. Nothing was written.',
    )
    process.exit(1)
  }

  const artworks = snapshot.docs.map((doc) => ({ id: doc.id, sellerId: doc.data().sellerId }))
  const pick = (index) => artworks[index % artworks.length]

  const now = Date.now()
  const HOUR = 60 * 60 * 1000
  const DAY = 24 * HOUR

  const seeds = [
    {
      label: 'upcoming',
      artwork: pick(0),
      startAt: Timestamp.fromMillis(now + 3 * DAY),
      endAt: Timestamp.fromMillis(now + 3 * DAY + 2 * HOUR),
      startingBid: 500000,
      bidIncrement: 10000,
      currentHighBid: null,
      bidCount: 0,
      winnerUid: null,
      winningBidAmount: null,
    },
    {
      label: 'live',
      artwork: pick(1),
      startAt: Timestamp.fromMillis(now - HOUR),
      endAt: Timestamp.fromMillis(now + 2 * HOUR),
      startingBid: 500000,
      bidIncrement: 10000,
      currentHighBid: 620000,
      bidCount: 7,
      winnerUid: null,
      winningBidAmount: null,
    },
    {
      label: 'completed',
      artwork: pick(2),
      startAt: Timestamp.fromMillis(now - 3 * DAY),
      endAt: Timestamp.fromMillis(now - 1 * DAY),
      startingBid: 500000,
      bidIncrement: 10000,
      currentHighBid: 2840000,
      bidCount: 42,
      winnerUid: 'seed-test-winner',
      winningBidAmount: 2840000,
    },
  ]

  const results = {}
  for (const seed of seeds) {
    const ref = db.collection('auctions').doc()
    await ref.set({
      artworkId: seed.artwork.id,
      sellerId: seed.artwork.sellerId ?? '',
      startAt: seed.startAt,
      endAt: seed.endAt,
      startingBid: seed.startingBid,
      bidIncrement: seed.bidIncrement,
      currentHighBid: seed.currentHighBid,
      bidCount: seed.bidCount,
      winnerUid: seed.winnerUid,
      winningBidAmount: seed.winningBidAmount,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    results[seed.label] = ref.id
  }

  console.log('Seeded 3 auctions into the emulator:\n')
  console.log(`  Upcoming:  http://localhost:5173/auctions/${results.upcoming}`)
  console.log(`  Live:      http://localhost:5173/auctions/${results.live}`)
  console.log(`  Completed: http://localhost:5173/auctions/${results.completed}`)
  console.log('\n(adjust the port above if your dev server runs on a different one)')
  process.exit(0)
}

await main()
