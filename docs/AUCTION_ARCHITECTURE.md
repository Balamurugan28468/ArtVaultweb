# ArtVault — Auction Architecture

**Status: design only.** No auction collection, Cloud Function, or UI
exists yet. Recorded now so the auctions module is built to one already-
reviewed design rather than improvised later.

## Trusted time model

- `createdAt` / `updatedAt` — ordinary `serverTimestamp()` audit fields.
- `startAt` / `endAt` — **explicit, deliberately-set `Timestamp` values**,
  created or validated through trusted admin/backend logic (e.g. "opens
  Friday 6pm IST, runs 48h"). They are scheduling data, not "time of
  write" data, so they are never `serverTimestamp()`.
- The client's countdown is **display-only** — it renders `endAt` against
  an estimated server/client clock offset purely for UX and has zero
  security authority.
- **Every bid-placing Cloud Function transaction independently re-checks
  `startAt <= trustedNow <= endAt`**, using the function's own server-side
  clock, inside the same transaction that validates and writes the bid. A
  bid is rejected there if the auction isn't currently open, regardless of
  whether any scheduled job has run yet.
- A scheduled closing function (Cloud Scheduler) exists only to promptly
  flip the auction's UI status at `endAt` — it is **not** the mechanism
  that prevents late bids; the per-bid transactional time check above is.

## Idempotent finalization

Finalization must tolerate: a scheduler firing late, a scheduler firing
twice, a client-triggered finalize racing the scheduler, and a reconnect
that resubmits the same finalize request. Design:

1. The finalize Cloud Function runs inside a Firestore transaction that
   first reads the auction doc's `status`. If already `finalized`, it
   returns immediately — a no-op for any duplicate/late/racing call.
2. Within that same transaction, it reads the current highest bid, sets
   `status: finalized`, records the winner, and creates the resulting
   order — one atomic step, so a crash or retry mid-way cannot produce two
   winners or two orders.
3. Firestore's transaction conflict detection serializes concurrent
   finalize attempts naturally: whichever commits first wins, and any
   other sees `status` already flipped and exits as a no-op.

## Bid privacy

The `bids` subcollection is not broadly world-readable. Public bid-feed
reads are served a restricted view (amount + timestamp + display alias)
via rules or a mirrored public-safe projection — never the bidder's uid or
contact details. See `docs/DATABASE.md`.
