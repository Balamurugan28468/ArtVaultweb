# ArtVault — Security Architecture

**Status: foundation + authentication + customer account + seller/artwork
foundation + artwork media + public artist profiles.** Module 00 shipped a
deny-by-default rules skeleton. Module 01 added the first real rule, the
first Cloud Function, and the real role model described below. Module 03
hardens that rule into a genuine field-level allow-list for customer
profile self-service edits. Module 04 adds `sellers/{uid}` and
`artworks/{artworkId}`, both backend-authoritative about the one thing that
actually matters (who may become a SELLER, who owns which artwork) exactly
the way Module 01 already established for `ADMIN`/`SUPER_ADMIN`. Module 05
opens `storage.rules` for the first time, scoped to exactly the artwork
photos an already-verified SELLER may touch. Module 06 opens
`firestore.rules` to an unauthenticated public read for the first time,
scoped to a deliberately narrow, physically separate public projection
(`artists/{artistId}`) that structurally cannot expose anything from the
private `sellers/{uid}` record it's derived from.

## Implemented in Module 06

- **ArtVault's first genuinely public (unauthenticated) Firestore read.**
  `artists/{artistId}` has `allow read: if true` — no other collection in
  this project has ever allowed a read without at least `isSignedIn()`.
  The blast radius is deliberately minimized by never opening this on the
  private `sellers/{uid}` document itself: `artists/{artistId}` is a
  physically separate document containing only two fields
  (`displayName`, `bio`) plus `uid`/timestamps — `contactEmail`, `status`,
  `appliedAt`, `reviewedAt`, and every other private field simply don't
  exist in it, so there is no rule to get wrong that would leak them.
  `sellers/{uid}`'s own rules are completely unchanged by this module —
  still `isOwner(uid)`-only for read, exactly as Module 04 left them.
- **Creation is not client-reachable at all.** `allow create: if false`
  unconditionally — not even the profile's own eventual owner can create
  it directly. The only two writers are `functions/src/promoteSeller.ts`
  (Admin SDK, at the moment of SELLER approval) and
  `functions/src/reconcileRoles.ts` (Admin SDK, backfilling one for an
  already-approved seller) — both operator scripts, never deployed or
  client-callable, mirroring exactly how `ADMIN`/`SUPER_ADMIN` and SELLER
  approval already work. This closes "a PENDING seller cannot obtain a
  public profile" and "a client cannot create an arbitrary artist
  identity" structurally, the same way `sellers/{uid}`'s own
  `allow update/delete: if false` closes "no second application" for free.
- **Owner self-service update is field-level allow-listed**, the same
  pattern Module 03 established for `users/{uid}`: `isOwner(artistId) &&
  hasRole('SELLER')` (the token claim, never a Firestore mirror — the
  Module 04 invariant, unchanged) plus `diff(...).affectedKeys().hasOnly(
  ['displayName', 'bio', 'updatedAt'])`, with `uid`/`createdAt` required
  unchanged. There is no "protected metadata" field on this document for a
  client to reach in the first place — the allow-list is really "these are
  the only two fields that exist to be edited."
- **Artwork visibility is deliberately unchanged.** `artworks/{artworkId}`'s
  rules are untouched — Module 06 does not open any public read path for
  artworks. `DRAFT`/`SUBMITTED` are the only lifecycle states that exist,
  and neither is a genuinely public one (see `docs/DATABASE.md`); the
  public artist page shows a static "no public artworks yet" state instead
  of ever reading `artworks` at all. A public artwork read path is the
  Marketplace/Publishing module's job, once a real public status exists.
- **Verified against the real Firebase Local Emulator Suite** — see
  `firestore-tests/artistProfiles.rules.test.ts` (21 tests): public read by
  a signed-out visitor, an authenticated customer, and another seller;
  a nonexistent id and a PENDING seller's (nonexistent) profile both fail
  safely; private `sellers/{uid}` fields are unreachable; creation is
  blocked for everyone including the profile's own eventual owner;
  cross-seller update is blocked; protected-field/oversized/undersized
  update attempts are blocked; and a regression check confirming a public
  visitor still cannot read a SUBMITTED artwork.

## Implemented in Module 05

- **`storage.rules` is opened for the first time**, scoped to
  `artworks/{ownerUid}/{artworkId}/{imageId}` only — every other path stays
  denied by the same closing catch-all the file started with in Module 00.
  A write/delete requires, all at once: the caller is signed in as
  `ownerUid` itself, holds the `SELLER` custom claim (read from the auth
  token, never a Firestore mirror — the same invariant Module 04
  establishes for Firestore rules), the file is a supported image
  (`image/jpeg`, `image/png`, or `image/webp`, ≤ 10 MB), and — via a
  cross-service `firestore.get()`/`firestore.exists()` lookup, since
  Storage and Firestore are independent services with no shared
  authorization context otherwise — the artwork this image belongs to
  actually exists, actually belongs to that same uid, and is still `DRAFT`.
  Reads stay owner-only, matching `artworks/{artworkId}`'s own read rule
  (no public Marketplace path exists yet for either).
- **`artworks/{artworkId}.images` accepts validated entries only while
  `DRAFT`.** `firestore.rules` pins each entry's `path` to exactly
  `artworks/{sellerId}/{artworkId}/{id}` — the one location a real upload
  for *this* artwork could ever produce — so Firestore metadata alone can
  never point at another seller's photo, another artwork's photo, or an
  arbitrary external URL; `contentType`/`size` are re-validated
  independently of `storage.rules`, since a client could otherwise write
  fabricated metadata without ever uploading anything through Storage at
  all. Firestore's rules language has no general element-wise loop over a
  list, so the ≤ 6 maximum is enforced via a small, fixed number of
  individually-checked indices (safe because `||` short-circuits before an
  out-of-bounds access). Changing `images` in the same write as submitting
  (`DRAFT → SUBMITTED`) is rejected, same as any other field — media is
  locked the instant an artwork is submitted, exactly like its other
  fields.
- **Verified against the real Firebase Local Emulator Suite** — both
  services, since the cross-service lookup above only proves itself against
  a real running pair. See `storage-tests/artworkImages.rules.test.ts` (16
  tests: upload/read/delete × owner/other-seller/customer/unauthenticated/
  wrong-lifecycle/unsupported-type/oversized) and the new image-update
  cases added to `firestore-tests/artworks.rules.test.ts` (bringing that
  file's + `sellers.rules.test.ts`'s + `users.rules.test.ts`'s combined
  total to 92). Run via `npm run test:storage-rules` and `npm run
  test:rules` respectively, against a disposable Firestore+Storage emulator
  pair — real owner data is protected via the same export/move-aside/
  restore pattern Module 04 established, since these tests wipe whatever
  project they run against.

## Implemented in Module 04

- **Seller role: no self-service path, mirroring Module 01's ADMIN
  pattern exactly.** A customer can `create` their own `sellers/{uid}`
  application, but the rule forces `status` to `'PENDING'` regardless of
  what the client sends, and **`update`/`delete` are both `false` for every
  client, including the applicant.** The only path from `PENDING` to
  `APPROVED` — which also grants the `SELLER` custom claim and mirrors
  `role: 'SELLER'` onto `users/{uid}` — is `functions/src/promoteSeller.ts`,
  a local operator script using Admin SDK credentials, structurally
  identical to `functions/src/setAdminClaim.ts` (never a deployed function,
  never a callable, never reachable by any client request). No Admin-review
  UI exists yet — deliberately deferred, not faked; see "Planned" below.
- **Duplicate-application protection comes from the rule engine itself, not
  application logic.** Firestore evaluates a write as `create` only when no
  document currently exists at that path and as `update` otherwise,
  regardless of which client SDK method was called — so a second
  `applyAsSeller` call against an existing application (still `PENDING`, or
  already `APPROVED`) is rejected as an unauthorized *update*, with no
  separate "already applied" check needed anywhere.
- **Artwork ownership is enforced field-by-field, not just by an identity
  check.** `create` requires `sellerId == request.auth.uid` *and* the
  `SELLER` custom claim (`request.auth.token.role == 'SELLER'`) — a
  `PENDING` applicant, or a plain `CUSTOMER`, cannot create an artwork no
  matter what they send. `update` requires `sellerId` to stay unchanged
  from the existing document (ownership can never be transferred by a
  client write) and only permits two transitions: ordinary field edits
  while `status` stays `'DRAFT'`, or submitting (`DRAFT → SUBMITTED`,
  touching only `status`/`updatedAt` in that same write, nothing else).
  Every other combination — including `SUBMITTED → DRAFT`, or setting any
  status value outside `DRAFT`/`SUBMITTED` — is rejected because neither
  update branch's `resource.data.status` guard matches it, not by an
  explicit exclusion list.
- **A `SUBMITTED` artwork is fully locked from the client's perspective —
  not just its editable fields.** No update of any kind succeeds once
  `status == 'SUBMITTED'` (covers "no reverting to DRAFT" and "no further
  edits" as one mechanism, not two separate checks), and `delete` requires
  both ownership and `status == 'DRAFT'`.
- **No public read path for artworks yet.** `read` requires
  `isOwner(resource.data.sellerId)` — an artwork, `DRAFT` or `SUBMITTED`,
  is visible only to the seller who owns it; a public Marketplace read rule
  is added only when a Marketplace module actually exists to use it, never
  speculatively.
- **Reading a genuinely nonexistent artwork is allowed for any signed-in
  user, ahead of the ownership check** (`allow read: if isSignedIn() &&
  (resource == null || isOwner(...))`), discovered as a real gap during
  Module 04 final hardening: evaluating `resource.data.sellerId` when
  `resource` doesn't exist fails rule evaluation the same way as "exists but
  you don't own it," so a seller opening their own just-deleted artwork's
  edit link got the exact same `permission-denied` — mapped to "You do not
  have permission to do that." — as an actual cross-owner access attempt,
  an actively misleading message for what is an ordinary, harmless flow.
  `resource == null` is Firestore's standard idiom for a nonexistent
  document; allowing it leaks nothing (there's no data on a document that
  doesn't exist) and still requires being signed in at all, not fully
  public. Reading an *existing* artwork still requires true ownership,
  unchanged.
- **`images` cannot be set to anything on `create`.** `create` requires
  `images.size() == 0` — a photo can only ever be added once the artwork
  document (and its id) already exists, since a real upload's Storage path
  is scoped to that id. Validated updates while `DRAFT` are Module 05's
  job — see below.
- **`price` is a schema-validated integer, never a float.** The rule
  requires `data.price is int && data.price >= 100` (≥ ₹1 in paise) —
  a request carrying a decimal/float price is rejected at the rule level,
  independent of the client-side whole-rupee-only form validation.
- **Verified against the real Firebase Local Emulator Suite, attacking the
  rules directly via the SDK — not just exercised through the UI.** See
  `firestore-tests/sellers.rules.test.ts` and
  `firestore-tests/artworks.rules.test.ts` (64 tests combined with the
  pre-existing `users.rules.test.ts`) — covering unauthenticated/forged/
  cross-owner attempts, privilege escalation via the mirrored `users/{uid}`
  document, and every documented status-transition boundary. Running all
  three rules-test files together (new to Module 04 — previously there was
  only one) surfaced a real test-infrastructure issue: they share one live
  Firestore emulator/project, and each file's own `beforeEach` calls
  `testEnv.clearFirestore()` (a whole-project wipe); run in parallel
  (Vitest's default), one file's clear can wipe another's in-flight
  fixtures mid-test. Fixed by setting `fileParallelism: false` in
  `vitest.rules.config.ts` — a real, permanent characteristic of sharing one
  emulator across files, not a one-off flake.

## Implemented in Module 03

- **`users/{uid}` update rule is now a real field-level allow-list, not
  just an identity check.** A client-issued update (via `updateDoc()` *or*
  a full-document `setDoc()` overwrite — Firestore rules treat both
  identically once the document exists) may only change
  `displayName`, `phoneNumber`, `bio`, `profileCompleted`, and `updatedAt`.
  This is enforced via `request.resource.data.diff(resource.data)
  .affectedKeys().hasOnly([...])` in `firestore.rules` — any request that
  touches an unlisted field (a new privileged key like `isAdmin`, or an
  existing protected one like `role`) is rejected outright, independent of
  the existing `uid == uid && email == email && role == role && createdAt
  == createdAt` identity check that was already in place from Module 01.
  `photoURL` was added to the protected set in Module 03: no avatar-upload
  feature exists yet, so the rule grants no write capability the app
  doesn't actually use.
- **Schema validation lives in the rule itself, not only in the client's
  Zod schema.** `displayName` must be a 2-60 character string,
  `phoneNumber`/`bio` must be strings within their length caps (or `null`),
  and `profileCompleted` must be a boolean — a request that skips the
  client (a hand-crafted write against the SDK) is still rejected by the
  same constraints the UI enforces.
  `updatedAt` must equal `request.time`, meaning it must be a genuine
  `serverTimestamp()` sentinel — a client cannot backdate or forge it.
- **`profileCompleted` is explicitly documented and enforced as UX metadata
  only.** The rule checks its type (`bool`) but never uses its value to
  gate access to anything — it must never become a security control by
  accident in a later module.
- **Verified against the real Firebase Local Emulator Suite**, not just
  read from the rules file — see `firestore-tests/users.rules.test.ts`
  (21 tests) and ARTVAULT_PROJECT_STATE.md's Module 03 entry for the full
  run.

## Implemented in Module 01

- **Role-based access:** `CUSTOMER | SELLER | ADMIN | SUPER_ADMIN` as a
  Firebase Auth **custom claim**, set only by `functions/src/index.ts`'s
  `onUserCreate` trigger (Admin SDK) — every new user is assigned
  `CUSTOMER` by default. The claim is the sole security authority read by
  the frontend (`getIdTokenResult(user).claims.role`, never a client-side
  variable); the mirrored `users/{uid}.role` Firestore field exists only
  for convenient reads and is never trusted by a rule or function.
- **`ADMIN`/`SUPER_ADMIN` have no self-service or in-app path at all.** The
  only way either is ever granted is `functions/src/setAdminClaim.ts` — a
  standalone script run locally by a human holding Admin SDK credentials
  (emulator env vars, or a production service-account key that is never
  committed). No deployed, client-reachable function can grant these
  roles.
- **`users/{uid}` Firestore rule:** a client can never `create` this
  document (only the Admin SDK trigger can); a client `update` is only
  allowed if `uid`, `email`, `role`, and `createdAt` are all unchanged from
  the existing document — role escalation from the client is structurally
  impossible, enforced by the rule itself, not just by convention. See
  `firestore.rules` and `docs/DATABASE.md`.
- **Session persistence:** the Firebase Auth SDK's `browserLocalPersistence`
  is set explicitly (rather than left as an implicit default) so a session
  survives a refresh/restart; `AuthProvider` exposes an explicit `loading`
  status while that restoration is in flight, so guarded routes never
  flash an incorrect signed-out state.

## Baseline established in Module 00

- `firestore.rules` and `storage.rules` deny all reads and writes by
  default. Every later feature module adds its own explicit, narrowly
  scoped rules — nothing is ever opened broadly "to unblock a feature."
- No secret or API key lives in any frontend-reachable file. The Firebase
  **client** config values (`VITE_FIREBASE_*`) are not treated as secrets —
  they are safe to ship to the browser per Firebase's own model, because
  Firestore/Storage/Auth security is enforced by rules, not by hiding the
  config. Genuine secrets (payment provider keys, AI provider keys) will
  live only in Cloud Functions config/Secret Manager when those modules are
  built — never in `.env`, never in the client bundle.
- `.env.example` ships only demo/placeholder values that work against the
  Local Emulator Suite; no real credential is committed anywhere.

## Planned (not yet implemented)

- **Seller application review UI.** Module 04 deliberately did not build an
  Admin reviewer screen — `functions/src/promoteSeller.ts` (a local
  operator script) is the only approval path today, exactly matching how
  `ADMIN`/`SUPER_ADMIN` already work. A real in-app review flow (approve/
  reject buttons, reviewer notes, an audit trail) belongs to the future
  Admin Control Center module.
- Sellers are not restricted from buying — role gating only restricts
  seller-studio and admin surfaces; cart/checkout rules are open to any
  authenticated user regardless of role.
- Every privileged write goes through a Cloud Function that re-validates
  the caller's custom claim server-side — Firestore rules are the first
  gate, the function is the second, independent check.
- App Check (reCAPTCHA v3, free tier) is planned to reduce scripted abuse
  of public endpoints once there are real endpoints to protect.
- `auditLogs` will be append-only and written exclusively by Cloud
  Functions, never directly by a client.
- Bidder identity in auctions is never exposed publicly — see
  `docs/DATABASE.md` for the public/private bid projection design.
- **Content-Security-Policy:** ArtVault does not define a CSP of its own
  yet (no `<meta http-equiv="Content-Security-Policy">`, no Hosting
  `headers` config). A real production CSP — script/style/connect-src
  scoped to Firebase and whichever AI/payment/search hosts are eventually
  chosen, with no `unsafe-eval` — is planned before production deployment,
  not before. See `ARTVAULT_PROJECT_STATE.md` → Security issues for a
  currently-open investigation item: a CSP "blocks eval" warning observed
  during local browser smoke testing, confirmed to originate outside
  ArtVault's own code (no CSP exists in the app to have blocked anything).
