# ArtVault — Project State

_Last updated: 2026-08-29 — Module 00 complete._

## Project version

`0.0.0` (unreleased, foundation stage — no deployed environment exists yet).

## Current module

**Module 00 — Foundation.** Complete, pending owner review.

## Completed modules

- **Module 00 — Foundation:** feature-first folder structure, routing
  shell, Tailwind design foundation, environment schema, Firebase client
  skeleton (emulator-only), deny-by-default Firestore/Storage rules,
  testing baseline, CI baseline, architecture documentation.

## Pending modules (not started, order not yet committed)

Auth, Customer Account, Seller Studio, Artwork Management, Artist
Profiles, Marketplace/Search, Wishlist/Likes/Follows/Sharing, Cart,
Checkout/Payments, Orders, Inventory, Reviews, Notifications, AI (analysis
/ assistant / search / recommendations), Auctions, AR Engine, Admin
Control Center, Audit Logs, Analytics, hardened Security Rules, Production
Deployment.

## Architecture decisions made so far

- Feature-first `src/` layout (see `docs/ARCHITECTURE.md`).
- TanStack Query for one-shot/backend requests; realtime Firestore
  subscriptions are owned by dedicated repository/hook pairs, never
  wrapped in TanStack Query, to avoid duplicate cache ownership.
- Zustand for local/UI state; React Context reserved for narrow,
  slowly-changing app-level concerns only.
- Tailwind CSS chosen over a full component library to keep dev-server
  memory/bundle size low on the target 8GB development laptop.
- Firebase project id `demo-artvault` — a `demo-`-prefixed id, which the
  Local Emulator Suite treats as fully offline and requiring no real
  Firebase project. Local dev needs no Firebase account at all.
- Role-based access will use Firebase Auth **custom claims**
  (`CUSTOMER | SELLER | ADMIN | SUPER_ADMIN`) as the sole security
  authority; a mirrored Firestore field is for convenience reads only.
- Auction `startAt`/`endAt` will be explicit trusted `Timestamp` values
  set by backend logic, never `serverTimestamp()`; every bid transaction
  independently re-validates trusted server time; finalization must be
  idempotent (see `docs/AUCTION_ARCHITECTURE.md`).
- AR: `<model-viewer>` as the provider; flat artwork requires a generated
  GLB plane pipeline; AR is withheld for any artwork missing real physical
  dimensions (see `docs/AR_ARCHITECTURE.md`).
- No unbounded array fields in Firestore documents — bounded subcollections
  used throughout (see `docs/DATABASE.md`).

## Deferred decisions (explicitly not made yet)

- Cloud Functions runtime (Node 20 vs 22) — chosen when Functions module starts.
- Payment provider and its fee structure — chosen in the payment module.
- AI provider behind the `AIProvider` interface — chosen in the AI module.
- Structured/full-text search provider beyond Firestore-native filtering.
- Enabling the Firebase Blaze billing plan, or any paid third-party service.

## Database version

Draft only — no collection has been created in a live project. See
`docs/DATABASE.md` for the current draft layout.

## Firestore collections (draft, not yet created)

`users`, `sellers`, `artists`, `artworks`, `carts/{uid}/items`, `orders`,
`orders/{orderId}/items`, `wishlists/{uid}/items`, `likes/{artworkId}/by`,
`follows` (bidirectional), `reviews`, `notifications`, `auctions`,
`auctions/{auctionId}/bids`, `auditLogs`.

## Indexes

None defined yet (`firestore.indexes.json` is an empty skeleton).

## Cloud Functions

None implemented. Runtime version deliberately not yet chosen.

## AI providers

None selected. `AIProvider` interface defined in `docs/AI_ARCHITECTURE.md`
only.

## AR implementation

None implemented. `<model-viewer>` is the design candidate; asset pipeline
designed but not built. See `docs/AR_ARCHITECTURE.md`.

## External services

None enabled. No Firebase billing plan (Blaze) enabled. No payment,
search, or AI provider account created.

## Environment variables

Names only (see `.env.example` — all values there are non-secret demo
placeholders for the emulator):

`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`,
`VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`,
`VITE_USE_FIREBASE_EMULATORS`.

## Known bugs

None.

## Security issues

None open. Firestore/Storage rules are deny-by-default; no real rule
exists yet because no real collection/path exists yet.

## Tests

Baseline established: Vitest + React Testing Library + jsdom. 3 files, 4 tests, all passing.
- `src/app/routes/HomePage.test.tsx` — smoke test for the placeholder route.
- `src/app/routes/router.test.tsx` — renders the real router and asserts
  `RootLayout` + `HomePage` compose correctly at `/`.
- `src/config/env.test.ts` — verifies the env schema's emulator-safe
  defaults, and that an invalid variable fails safely with an actionable
  error rather than a raw validation stack trace.

## Deployment

Not deployed. Local Emulator Suite only, not yet exercised in this module
(configuration is ready — see `docs/DEPLOYMENT.md`).

## Costs

₹0. No billing plan enabled, no paid resource created.

## Technical debt

- The production build emits a single ~856 kB JS chunk (Vite's
  chunk-size warning threshold is 500 kB), mostly the Firebase client SDK
  loaded eagerly from `main.tsx`. Expected to resolve naturally once real
  routes exist and route-level code-splitting (`React.lazy`) is introduced
  in later modules — not addressed now to avoid premature optimization of
  a shell with only one page.
- Running `npm run test` (Vitest) inside this machine's sandboxed shell
  fails to spawn worker threads/forks (times out). It passes normally
  outside the sandbox restriction. Not a code defect — CI (GitHub Actions,
  Linux) is unaffected; only local sandboxed tool execution on this
  machine hits it.
- No top-level React error boundary yet. If `src/config/env.ts` throws
  (invalid `.env` value), the failure is a clear console error but a blank
  page for the user — acceptable at foundation stage with only a
  placeholder route, but worth adding a minimal error boundary once real
  screens exist and a blank failure page would actually confuse someone.

## Next action

Await owner review of Module 00, then propose and get sign-off on the
Module 01 scope (expected candidate: Authentication, given most other
modules depend on a real user/role model).
