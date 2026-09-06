# ArtVault — Project State

_Last updated: 2026-09-06 — Module 05 (Artwork Media/Image Upload) —
Storage-backed photo upload for Seller Studio DRAFT artworks, plus the
Firebase emulator launcher lifecycle hardening it surfaced (stale-lock
identity verification, tree-aware orphan-process cleanup covering dynamic
Functions-worker ports) — **implementation, tests, and the owner's own
real upload/restart verification all complete, verified, and committed**;
see "Module 05 — Artwork Media/Image Upload & Emulator Lifecycle Hardening"
below for the full write-up. Module 04 Final Hardening & Firebase Emulator
Persistence / Seller-Authorization Reconciliation: implementation, tests,
and the **owner's own real Windows Ctrl+C manual restart verification** all
**complete, verified, and committed** (`877f3ba`, full hash
`877f3bab8e163fa9c0c7832a6fd05baa0d1523c4`, on top of `1f0deb7`) — see
"Module 04 — Emulator Persistence & Seller-Authorization Reconciliation"
below for the full write-up. Module 04 (Seller Foundation &
Artwork Draft Management) core implementation, tests, real-browser/emulator
verification, and the owner's own full manual acceptance walkthrough remain
**complete and committed** (`d483994`, `1f8ca5a`, `1f0deb7`). Acceptance
testing surfaced and fixed two real pre-existing (Module 01) sign-up/
profile-provisioning bugs — see the module write-up below. Current
authentication method remains Email + Password only — see "Authentication
methods — current scope" below. Pre-Module-04 validation & error-message
hardening remains **COMPLETE, owner-approved, and committed** (`d5c1a18`).
Module 03 (Customer Account & Profile Foundation) remains complete,
owner-approved, and committed. Module 02 remains complete, owner-approved,
and committed (`77cee05`); Module 01 remains complete and committed._

## Project version

`0.0.0` (unreleased, foundation stage — no deployed environment exists yet).

## Current module

**Module 05 — Artwork Media/Image Upload: implementation complete,
verified, owner manually accepted end to end, and committed** — Storage-
backed photo upload (add/preview/reorder/remove, progress/retry/cancel) for
Seller Studio DRAFT artworks, plus the emulator launcher lifecycle
hardening (stale-lock identity verification, tree-aware orphan-process
cleanup) it surfaced. See "Module 05 — Artwork Media/Image Upload &
Emulator Lifecycle Hardening" below for the full writeup. Module 04
(Seller Foundation & Artwork Draft Management: `d483994`, `1f8ca5a`,
`1f0deb7`; Emulator Persistence & Seller-Authorization Reconciliation:
`877f3ba`) remains complete, verified, and committed. Module 06 has not
been started. See "Completed modules" for the checkpoint entry.

## Authentication methods — current scope

Email Link and Phone OTP authentication were evaluated but intentionally
deferred by owner. Current authentication method: Email + Password. These
methods may be implemented later if requested.

A full working implementation of Email Link (passwordless) and Phone OTP
sign-in — including a multi-method Sign In tab selector, the account-linking
analysis (Firebase's default "one account per email" already covers
Email Link/password overlap; Phone OTP does not, and was documented as a
known gap rather than unsafely auto-merged), and a development-only
emulator notice for each — was built, real-browser and emulator verified,
and reported to the owner, but was **never committed**. Per this later
instruction, it was fully removed from the working tree before any commit
happened; the working tree was verified byte-identical to the prior
approved commit (`d5c1a18`) after removal. Sign In today is Email/Password
only, exactly as approved in Module 01 and hardened in the validation pass
above.

## Module 05 — Artwork Media/Image Upload & Emulator Lifecycle Hardening (COMPLETE / VERIFIED / COMMITTED)

**Status:** implementation, automated tests, and real-emulator verification
all complete. The owner personally uploaded real photos to their real DRAFT
artwork in a real browser, confirmed they persisted across a full emulator
restart, and separately confirmed the emulator-launcher lifecycle fix
(below) with their own retest. Review result: **PASS — owner manually
accepted**.

### Feature: artwork photo upload

Sellers can add up to 6 photos (JPEG/PNG/WebP, ≤10 MB each) to a DRAFT
artwork in Seller Studio: multi-select add, live upload progress, preview
thumbnails, reorder (move earlier/later), remove before or after upload
completes, retry a failed upload, and duplicate-in-flight-file protection.
Photos are locked (read-only, same component renders both states) the
instant an artwork is SUBMITTED, exactly like its other fields.

- **Data model:** `artworks/{artworkId}.images` changed from an always-
  empty placeholder (`string[]`) to real entries:
  `{ id, path, url, order, contentType, size }`. `path` is pinned to
  `artworks/{sellerId}/{artworkId}/{id}` — the one Cloud Storage location a
  real upload for *this* artwork could ever produce.
- **Security — `storage.rules`, opened for the first time** (previously
  fully closed): a write/delete requires the caller signed in as the
  path's own owner uid, holding the `SELLER` custom claim (from the auth
  token, never a Firestore mirror — the Module 04 invariant), a supported
  content-type/size, and — via a cross-service `firestore.get()` lookup,
  since Storage and Firestore share no authorization context otherwise —
  that the artwork this image belongs to actually exists, belongs to that
  same uid, and is still DRAFT. Reads stay owner-only (no public
  Marketplace path exists yet, matching `artworks/{artworkId}`'s own read
  rule).
- **Security — `firestore.rules`:** `images` entries are validated while
  DRAFT (path/content-type/size/count, ≤6, re-checked independently of
  Storage — a client could otherwise write fabricated metadata without
  ever uploading anything real); `create` still forces `images.size() == 0`
  (a photo can only be added once the artwork, and its id, already exist);
  changing `images` in the same write as submitting is rejected like any
  other field.
- **Firestore writes** for every images-array change (add/remove/reorder)
  go through one transaction helper (`mutateArtworkImages`) rather than a
  plain `updateDoc`, so two uploads finishing back-to-back apply cleanly
  instead of racing each other from a stale read.
- **Cleanup:** discarding a DRAFT now also best-effort deletes its Storage
  images before deleting the Firestore document (previously would have
  orphaned them).
- **Real owner verification:** uploaded 2 real photos (840 KB, 1.16 MB) to
  the real "3d" DRAFT artwork through the real browser UI — upload started
  immediately (first progress event at +93ms in the equivalent automated
  check), thumbnails appeared, no console errors. Firestore metadata and
  the real Storage objects were independently confirmed via the Admin SDK,
  both before and after a full emulator restart, byte-size-identical
  throughout.

### Fix: emulator launcher stale-lock and orphan-process handling

Rolling out Module 05 surfaced a real gap in Module 04's single-instance
launcher guard (`scripts/start-emulators.mjs`), reproduced directly on this
machine before being fixed:

- **Stale-lock detection was PID-reuse-vulnerable.** The original check
  only asked "is *some* process alive at this PID?" — Windows recycles PIDs
  quickly, so a launcher that was force-killed rather than shut down
  cleanly could leave a lock file naming a PID since reassigned to an
  unrelated process, wrongly treated as "still running." Fixed:
  `isLauncherProcess()` also verifies (via the PID's own command line) that
  it actually names `start-emulators.mjs`.
- **A stale-lock reclaim never checked for orphaned emulator children still
  bound to the required ports.** Starting a second suite on top of them
  produced exactly the originally-reported symptom: a lone orphaned
  Firestore process answering on 8080 while Auth/Storage sat dead. Fixed:
  before starting, the launcher now identifies (never guesses) any of its
  own orphaned processes and stops them first.
- **Ownership detection was port-anchored only, missing the Functions
  Emulator's own worker** (and the firebase-tools hub process itself, and
  the Storage rules-runtime helper) **entirely**, since a Functions worker
  binds to a different, unpredictable port every run and the hub/helper
  processes carry no absolute, project-specific argument of their own at
  all. Fixed with a tree-aware ownership computation
  (`scripts/lib/emulatorGuards.mjs`'s `computeOwnedEmulatorPids`): a
  process is *seeded* as owned only by direct content proof (an absolute
  path naming this exact project, plus a real emulator marker, both in its
  own command line — e.g. Firestore's `--seed_from_export <abs path>`, or a
  Functions worker's `...firebase-functions.js "<abs functions dir>"`),
  then the climb walks upward *only* through bare `cmd.exe`/`node.exe`
  wrapper hops (the exact, and only, shapes this launcher's own spawn chain
  can ever produce), capped at 8 hops, and finally sweeps back down to
  catch content-less siblings. A process that only partially matches (or
  that a required port's occupant can't be proven to be ours) is never
  touched — startup fails loudly instead of guessing.
- **Startup readiness now independently verifies** Auth/Firestore/Storage
  are actually `LISTENING` (a real TCP probe) before ever printing a
  "ready" line — not just trusting firebase-tools' own text output.
- **Graceful shutdown** also sweeps for and stops any straggler matching
  the same ownership computation, in case the console Ctrl+C broadcast
  doesn't reach every descendant.
- **Real verification:** reproduced the exact broken state twice (once via
  a genuine leftover orphan discovered mid-session, once by deliberately
  force-killing only the top wrapper process to leave the rest of the tree
  alive) and confirmed the fixed launcher correctly identified and stopped
  every orphan — including the firebase-tools hub and the Storage
  rules-runtime helper, neither directly provable on their own — with zero
  unidentified processes and zero manual intervention, both times. Owner
  data (SELLER/APPROVED status, artwork, both uploaded images) was
  confirmed byte-identical via the Admin SDK before and after each cycle.

### Tests

- **Frontend:** 361/361 passing (up from 320) — new hook
  (`useArtworkImages`), Storage-helper, and component tests for the upload
  flow.
- **Firestore rules:** 92/92 (82 pre-existing + 10 new image-validation
  cases).
- **Storage rules:** 16/16 (new `storage-tests/artworkImages.rules.test.ts`
  — upload/read/delete × owner/other-seller/customer/unauthenticated/
  wrong-lifecycle/unsupported-type/oversized), run via
  `npm run test:storage-rules` against a disposable Firestore+Storage
  emulator pair, real owner data protected via the same export/move-aside/
  restore pattern Module 04 established.
- **Emulator launcher guards:** 47/47 new tests
  (`scripts/lib/emulatorGuards.test.mjs`, run via `npm run test:scripts`) —
  dead/live/recycled-PID stale-lock cases, the ancestor climb (including
  its non-wrapper stop and 8-hop cap) and sibling sweep, ambiguous-evidence
  fail-safes, missing process metadata, and the combined
  dead-lock-plus-port-orphan-plus-dynamic-port-orphan real-world scenario.
- **Build/typecheck/lint:** all clean (pre-existing advisory warnings
  only).

### Known limitations

- No drag-and-drop reordering — Move earlier/later buttons only.
- No server-side sweep for a Storage upload that completes but whose
  Firestore save fails permanently (e.g. the artwork was submitted from
  another tab mid-upload); the client's own best-effort cleanup correctly
  can't delete it either once the artwork is no longer DRAFT — a rare,
  self-correcting edge case, not a security gap.
- The shutdown-side orphan sweep's *trigger* (a real SIGINT reaching the
  launcher) couldn't be forced live from this session's own tooling, for
  the same reason already documented in Module 04: no reliable way to
  deliver a literal Ctrl+C to a detached background process from here.
  Verified via unit tests and code review instead; the pre-startup cleanup
  path — the one that actually recovers an already-broken state — was
  proven live, repeatedly, against real orphaned process trees.
- The ancestor-climb identity check is Windows-only and name-allowlisted to
  `cmd.exe`/`node.exe`; on a platform where this project's spawn chain ever
  produced a different intermediate process shape, that hop stops the
  climb early rather than risk over-reaching.

## Module 04 — Seller Foundation & Artwork Draft Management (COMPLETE, owner manually accepted, committed)

**Status:** implementation, automated tests, Firestore rules tests, and
real-browser/emulator verification all complete. The owner then personally
performed the full manual acceptance walkthrough in a real browser against
the Local Emulator Suite and confirmed PASS. Committed as `d483994`
(implementation), `1f8ca5a` (project-state correction), and this closeout
commit (acceptance-testing regression fixes — see below).

### Scope

Exactly the plan approved before implementation: a real "Become a seller"
application flow, backend-authoritative seller-role promotion (no
self-service path, mirroring the existing ADMIN pattern), a Seller Studio
shell gated to the `SELLER` role, and artwork draft CRUD limited to the
`DRAFT`/`SUBMITTED` lifecycle. Explicitly out of scope and not built: real
image upload (Module 05), an Admin review UI, any artwork status beyond
`DRAFT`/`SUBMITTED`, a dedicated Inventory feature, and Marketplace/public
artwork browsing.

### Seller application flow

`Account page → "Become a seller"` (the previously-disabled placeholder
button is now the one real, functional entry among the future-sections
grid — every other entry stays genuinely disabled) `→ /seller/apply` →
validated form (business name, seller description, contact email —
prefilled from the signed-in account's own email, never asking the user to
retype data ArtVault already has) → submit → `sellers/{uid}` created with
`status: 'PENDING'` → the same page now shows a status card ("Pending
review" — copy deliberately never implies approval) instead of the form
again, blocking re-application.

### Seller-role security (backend-authoritative, no frontend grant path)

A client can create their own `PENDING` application but can never set
`status: 'APPROVED'`, never modify another user's application, and never
set `role: 'SELLER'` on `users/{uid}` directly — all independently
rules-enforced, not just hidden by the UI. The only promotion path is
`functions/src/promoteSeller.ts`, a new local operator script (Admin SDK
credentials, `npm run promote-seller -- <uid>` inside `functions/`),
structurally identical to the existing `setAdminClaim.ts`: never deployed,
never a callable, never reachable by any client request. It grants the
`SELLER` custom claim, mirrors `role: 'SELLER'` onto `users/{uid}`, and
flips the application to `APPROVED` — refusing to run if no application
exists, or if it's already approved (an idempotency guard, not a silent
no-op). No Admin-review UI exists yet — deliberately deferred to a future
Admin Control Center module, not faked.

Verified end-to-end in a real browser against the Local Emulator Suite: a
signed-up customer applies, is confirmed still unable to reach
`/seller-studio` by direct URL while `PENDING`, is promoted via the
operator script, signs out and back in to pick up the new custom claim (no
in-app "refresh my role" affordance exists — matches how role changes have
always required a fresh token in this project), and only then sees the
Seller Studio nav item and gains access.

### Seller Studio & artwork CRUD

New `RequireRole` route guard (nested inside the existing `RequireAuth`
subtree in `router.tsx`, so it only ever runs once auth status is already
resolved) protects `/seller-studio*`; a `CUSTOMER` or unauthenticated user
is redirected to `/account`. The `seller-studio` nav item (already reserved
since Module 02 with `status: 'comingSoon'`) is flipped to `'available'` —
no other navigation-config changes were needed.

Seller Studio ships: a home page (links to My Artworks / Create Artwork),
My Artworks (realtime, own-artworks-only list), Create Artwork, and Edit
Draft Artwork — the same form component handles both create and edit.
Sellers can save a draft repeatedly, edit an existing draft, submit it for
review (`DRAFT → SUBMITTED`, one-way in this module), and discard
(delete) a draft they no longer want. Once `SUBMITTED`, the form renders a
read-only summary instead — no Save/Submit/Discard controls exist for a
submitted artwork, and the underlying Firestore rule independently rejects
any such write regardless of what the UI shows.

### Artwork data model

```
artworks/{artworkId}
  sellerId: string          immutable after create
  title: string              2-100 chars
  description: string        10-2000 chars
  price: number               integer minor currency units (paise = ₹ × 100); never a float anywhere
  category: string            one of painting | sculpture | photography | digital | other
  tags: string[]               up to 10, 30 chars each
  images: string[]             always [] — rule-enforced, real upload is Module 05
  inventoryCount: number      integer >= 0
  status: 'DRAFT' | 'SUBMITTED'
  createdAt, updatedAt: Timestamp (server)
```

`price` is entered by the seller as a whole-rupee amount and converted to
integer paise only at the point the write payload is built
(`ArtworkForm.tsx`'s submit handler) — never stored, compared, or
transmitted as a float. No decimal/paise-level pricing input exists yet
(documented simplification). See `docs/DATABASE.md` for the full field-by-
field writeup and `docs/SECURITY.md` for the rule rationale.

### Firestore security rules

New `sellers/{uid}` and `artworks/{artworkId}` blocks added to
`firestore.rules`, ahead of the existing deny-by-default catch-all (left
untouched). `users/{uid}`'s existing rule is completely unmodified. Full
rationale, including exactly which transitions are/aren't allowed and why,
is in `docs/SECURITY.md`'s new "Implemented in Module 04" section.

### Tests

- **Frontend suite: 297/297 passing (43 files)** — up from 161/25 at the
  last pre-Module-04 commit. New coverage: `integerField` (shared
  validator), seller/artwork schemas, seller/artwork repositories (mocked
  Firestore SDK), `useSellerStatus`/`useApplyAsSeller`/`useSellerArtworks`/
  `useArtwork`/`useCreateArtwork`/`useUpdateArtwork` hooks,
  `SellerApplicationForm`/`SellerStatusCard`/`ArtworkForm`/`ArtworkListItem`
  components, `RequireRole` guard, the updated `AccountSections`/
  `AccountPage`/`useNavItems`, a `Toast` auto-dismiss test, 4 real
  lazy-route regression tests (`router.test.tsx`), the sign-up-race tests
  (`profileReady.test.ts`/`authClient.test.ts`), and the
  provisioning/orphan-profile tests (`useUserProfile.test.tsx`/
  `AccountPage.test.tsx`) — see the subsections above.
- **Firestore rules suite: 64/64 passing** — the pre-existing 21
  (`users.rules.test.ts`, unaffected) plus two new files,
  `sellers.rules.test.ts` (16) and `artworks.rules.test.ts` (27), attacking
  the rules directly via the SDK (forged uid/sellerId, cross-owner
  read/update/delete, privilege escalation via the mirrored `users/{uid}`
  doc, every status-transition boundary) rather than only exercising them
  through the UI. Unchanged and re-verified during the acceptance-testing
  fixes above — no rule was touched.
- **Functions suite: 9/9 passing** — the pre-existing 2 (`index.test.ts`)
  plus 3 (`promoteSeller.test.ts`: grants correctly, refuses when no
  application exists, refuses to re-promote an already-approved one) plus 4
  new (`repairMissingProfile.test.ts`: repairs from the real Auth record
  defaulting to `CUSTOMER`, refuses to touch an existing profile, normalizes
  missing fields to null, never grants a non-`CUSTOMER` role).
- **Real-browser verification (Playwright Chromium, Local Emulator Suite):
  57/57 checks at initial implementation, plus a further 12/12 and two
  independent 8/8 checks during acceptance-testing fixes, all 0 genuine
  console errors.** Full workflow verified: customer → apply → PENDING →
  blocked from Seller Studio → operator-script promotion → sign-out/sign-in
  → SELLER → create → edit → submit → SUBMITTED-locked → a second seller
  confirmed unable to read or list the first seller's artwork (Firestore
  permission-denied, mapped to a safe message) — plus the full required
  viewport matrix (1366×768 down to 302×531) on every new screen, plus a
  from-scratch fresh-account sign-up/sign-out/sign-in/refresh cycle.
- **Owner's own final manual acceptance pass in a real browser** — see
  "Owner final manual acceptance" above. PASS.

### Real bugs found and fixed during this module (not introduced by it)

- **`shared/ui/Toast.tsx` never auto-dismissed.** Discovered because two of
  this module's new pages (`SellerApplicationPage`, `ArtworkFormPage`) call
  `toast.success(...)` at points immediately followed by clicking the top
  bar's account menu in real-browser testing — a lingering toast (the
  component only ever had a manual dismiss button) sat at `top-4` and
  physically blocked that click. This is a real, standing UX defect
  affecting every existing `toast.success()` call in the app (including
  Module 03's `EditProfileModal`), not something Module 04 introduced —
  simply the first flow to click something a toast could cover. Fixed with
  a 5-second auto-dismiss timer (manual dismiss still available), covered
  by a new `Toast.test.tsx`.
- **Running more than one `*.rules.test.ts` file exposed a real
  test-infrastructure race.** All rules-test files share one live Firestore
  emulator/project; each independently calls `testEnv.clearFirestore()` (a
  whole-project wipe) in its own `beforeEach`. Run in parallel (Vitest's
  default), one file's clear could wipe another's in-flight fixtures —
  intermittent, not a rules-logic bug (every test passes reliably once
  serialized). Fixed permanently via `fileParallelism: false` in
  `vitest.rules.config.ts`, not a one-off `--no-file-parallelism` flag
  someone would have to remember. Module 03 never hit this because it was
  the only rules-test file that existed until now.

### Auth/profile race and orphan-profile recovery (found during owner manual acceptance testing)

Owner manual testing after the `d483994` commit surfaced two real, related
problems in the pre-existing (Module 01) sign-up/profile-provisioning path —
neither is Module 04 feature code, but both blocked genuine acceptance
testing of Module 04's own flows and are fixed here as required regressions:

- **Sign-up race:** `signUpWithEmail` (`src/features/auth/api/authClient.ts`)
  wrote the submitted display name to `users/{uid}` right after
  `waitForRoleClaim` resolved — an unrelated signal used only as a guess
  that the `onUserCreate` trigger's own Firestore write had *probably* also
  finished by then. It hadn't always. Fixed with a new
  `waitForUserProfileDocument` (`src/features/auth/api/profileReady.ts`): a
  real-time `onSnapshot` listener that waits on the actual precondition (the
  document existing) rather than a proxy signal, a fixed delay, or polling —
  with a 15s safety-net timeout that rejects (never silently swallows) a
  genuine provisioning failure. Covered by
  `profileReady.test.ts`/`authClient.test.ts` (6 tests).
- **A real, reproduced Functions-emulator failure mode, not a code bug:**
  investigating a hang while verifying the race fix live showed the local
  Functions emulator had been failing to load `onUserCreate` for large
  stretches of this session (`Failed to load function definition from
  source... Timeout after 10000`) — its discovery worker was actually
  finishing successfully, just after the CLI's hard-coded 10s window, almost
  certainly due to sustained system load from many hours of concurrent
  test/build/browser-automation runs. A clean restart with nothing else
  competing for CPU loaded it correctly. This explains why a genuinely
  **orphaned account** existed (a real Firebase Auth user with no matching
  `users/{uid}` document, created during that window) and surfaced as a
  misleading "No profile found" screen for the owner's own account.
- **Orphan-profile recovery, done safely, not client-side:** since a client
  can never be allowed to create `users/{uid}` itself (that's exactly what
  the rule prevents), recovery needed a trusted path.
  `functions/src/repairMissingProfile.ts` (new local operator script, never
  deployed/callable — same pattern as `setAdminClaim.ts`/`promoteSeller.ts`)
  reuses `handleUserCreate` — the exact tested logic the trigger itself
  runs — sourced from the real Auth user record, refusing to act if a
  profile already exists (idempotent, never a duplicate), and with no role
  parameter at all, so it can never grant anything but the default
  `CUSTOMER`. Run once against the owner's own orphaned account during
  acceptance testing; verified directly via the Firestore emulator REST API.
  Covered by `repairMissingProfile.test.ts` (4 tests).
- **UI now distinguishes "still provisioning" from "genuinely missing":**
  `useUserProfile`/`ProfileState` gained a `provisioning` status, computed
  from the Auth user's real `metadata.creationTime` (never fabricated) — a
  profile missing for an account created in the last 20s shows a calm
  "Setting up your account…" state that self-heals the instant the
  real-time listener sees the document arrive; older than that, the
  existing honest "No profile found — try signing out and back in" state is
  unchanged. A one-shot timer only ever downgrades that label once the
  grace window closes — it never gates or retries the actual subscription.
  Covered by 4 new `useUserProfile.test.tsx` tests and 1 new
  `AccountPage.test.tsx` test.
- Confirmed via a fresh, from-scratch real-browser/emulator run (not a
  reused test account) that the full chain now holds without exception:
  sign up → Auth user created → `users/{uid}` exists → correct `CUSTOMER`
  role → correct display name shown immediately → survives refresh → sign
  out → sign in → survives refresh again → zero console errors.

### Owner final manual acceptance (real browser, Local Emulator Suite)

Independently of all automated verification above, the owner personally
walked the complete flow end to end and confirmed: seller promotion takes
effect after sign-out/sign-in; Account shows the `SELLER` role; Seller
Studio is reachable and survives navigation/refresh; Create Artwork
enforces required-field validation; a valid artwork saves as `DRAFT` and
its data persists correctly; a draft submits to `SUBMITTED` and stays
`SUBMITTED` across refresh/navigation; opening a submitted artwork shows
"This artwork has been submitted and can no longer be edited." and offers
no way to edit it back through the UI. **Owner manual acceptance: PASS.**

### Known limitations (documented, not silently accepted)

- No Admin-review UI — seller promotion is a local operator script only,
  matching the existing ADMIN/SUPER_ADMIN precedent exactly.
- No real image upload — `images` is schema-reserved but rule-enforced
  empty; Module 05's job.
- No paise-level/decimal artwork pricing input — whole rupees only.
- No public Marketplace read path for artworks — an artwork is visible
  only to the seller who owns it until a Marketplace module exists.
- A phone-OTP-style "same person, two accounts" gap doesn't apply here
  (seller identity is the same `uid` as the underlying `users/{uid}`
  account, not a separate identity), but the analogous risk — no in-app way
  to *revoke* SELLER — is out of scope for the same reason the review UI is.
- The local Functions emulator's discovery step can time out under heavy
  sustained concurrent load on this dev machine (see above) — a real
  characteristic of this tooling/environment, not something a code change
  fixes; if `onUserCreate` ever again fails to load, restart the emulator
  suite with nothing else competing for CPU. `repair-missing-profile` exists
  specifically to recover any account caught by this while it was down.

## Module 04 — Emulator Persistence & Seller-Authorization Reconciliation (COMPLETE / VERIFIED / COMMITTED)

**Status:** implementation, automated tests, and extensive real-emulator
restart testing all complete. The owner then personally performed the real
Windows Ctrl+C shutdown/restart workflow in their own terminal and confirmed
**PASS**. Committed as `877f3ba` (full hash
`877f3bab8e163fa9c0c7832a6fd05baa0d1523c4`), on top of `1f0deb7`.

### Trigger

After a real emulator/Vite restart, an account that had previously shown
Auth claim `SELLER`, `users/{uid}.role` `SELLER`, and `sellers/{uid}.status`
`APPROVED` (with a working Seller Studio) reverted to `CUSTOMER`. Restarting
local dev tooling must never affect authorization — investigated to a real,
evidenced root cause rather than patched around.

### Root cause (proven, not guessed)

Vite's dev-server file watcher held an open OS-level lock on `./emulator-data`
for the entire time `npm run dev` was running — confirmed directly (a
`Rename-Item` on `./emulator-data` failed while Vite was running and
succeeded the instant it was stopped, with the emulator suite left running
throughout). `firebase emulators:start --export-on-exit` replaces
`./emulator-data` by removing it and renaming a freshly-written export into
place; with Vite's lock held, that removal silently failed and the fresh
export was stranded in an orphaned `firebase-export-<timestamp>/` directory
instead of ever reaching `./emulator-data`. Under the exact "both processes
running all day" workflow this project's own daily workflow calls for, no
new emulator state could ever actually survive a restart — which is exactly
why the SELLER promotion never carried forward.

A second, real gap found while re-verifying this fix under this session's
own testing: nothing prevented two emulator launchers from touching
`./emulator-data` concurrently. This was directly observed (a second,
unaware `npm run emulators` briefly ran alongside the one under test) and
evidenced on disk by a snapshot whose Auth and Firestore export components
had mismatched write times — proof it had been assembled from more than one
export operation. No authorization data was ever actually lost from this,
but it was a real latent risk, now closed (see below).

### Fixes

- **`vite.config.ts`** — `server.watch.ignored: ['**/emulator-data/**',
  '**/firebase-export-*/**']`. Vite has no reason to watch local
  Auth/Firestore/Storage snapshot data (never part of the app bundle); this
  is the fix that matters for the owner's real daily Ctrl+C workflow.
- **`scripts/start-emulators.mjs` — single-instance guard.** A PID-stamped
  lock file (`.emulator-launcher.lock`, gitignored, never inside
  `emulator-data` itself) is acquired before anything else runs. A second
  launcher detecting a live holder exits immediately with a clear message,
  touching no persistence, ports, or exports. A stale lock (left by a
  process that crashed or was force-killed) is detected via a liveness check
  and safely reclaimed. Verified with a real duplicate-launch attempt (
  correctly refused) and two real stale-lock reclaims during actual restarts.
- **`scripts/start-emulators.mjs` — safe snapshot/export architecture.**
  Every startup that imports a previous export now first copies it to
  `./emulator-data.backup` (a plain copy, never a move) *before* anything
  this session does could replace it — so the last known-good generation
  always exists on disk independent of whether this session's own eventual
  export turns out corrupt. On shutdown, if the resulting export is
  structurally incomplete (`isCompleteExport` — checks the metadata file,
  the Auth accounts file, the Firestore metadata file, and, if present, a
  recorded manifest hash), the backup is restored automatically rather than
  leaving broken data as canonical; the recovery mtime comparison (added
  earlier this session after a real bug was caught in its own verification —
  comparing the export directory's own mtime could mistake a freshly
  copied/restored old snapshot for the newest one) is based on the metadata
  **file's** mtime specifically, immune to that. A SHA-256 generation-hash
  manifest (`artvault-snapshot-manifest.json`) records that a completed
  export's Auth and Firestore components genuinely belong to the same
  generation; a later mismatch (tampering, partial external overwrite) is
  detected on the next startup rather than silently imported. Verified: 13
  isolated sandboxed scenarios covering missing/older/newer/incomplete
  candidates and the directory-vs-file-mtime edge case specifically, plus a
  real (naturally occurring, not simulated) child-exit event that produced a
  valid, hash-matching manifest.
- **`scripts/start-emulators.mjs` — readiness barrier + trusted
  reconciliation on every startup.** After Firebase reports "All emulators
  ready," the wrapper automatically runs `reconcile-roles` (below) against
  the just-imported data and only then reports readiness to the terminal —
  so a restored SELLER claim is guaranteed consistent before the app is ever
  told it's safe to connect. Verified across every restart this session: the
  correct account(s) reported `already-consistent`, and the PENDING owner
  was correctly left untouched every time.
- **`functions/src/reconcileRoles.ts`** (new, local operator script — never
  deployed, never a callable, unreachable from any client). If
  `sellers/{uid}.status == 'APPROVED'`, may restore the Auth `SELLER` claim
  and/or the `users/{uid}.role` mirror (including recreating a missing
  profile document, sourced from the real Auth record) — never anything but
  the literal string `'SELLER'`, so ADMIN/SUPER_ADMIN can never be produced.
  If the seller record is `PENDING` or missing, it is a no-op — never
  invents approval, never promotes, never demotes. Idempotent (checked, not
  just re-written). 9/9 tests, including one asserting the exact literal
  `{role: 'SELLER'}` argument on every write.
- **`functions/src/verifyEmulatorState.ts`** (new, read-only operator
  script, `npm run verify:emulator-state`) — reports Auth/Firestore/seller/
  artwork counts, approved-sellers-with-claim consistency, an optional
  owner-specific section (Auth found/email/role, `users.role`,
  `sellers.status`, artwork count), and the on-disk snapshot generation
  hash. Never writes.
- **`src/features/auth/api/ensureUserProfile.ts`** — audited: never
  overwrites an existing profile regardless of what role is passed (a
  structural no-op, not a convention); when recovering a missing profile, it
  defers to Admin-SDK reconciliation rather than self-promoting if
  `sellers/{uid}.status == 'APPROVED'` while the client's own token still
  says CUSTOMER — the client never grants SELLER from Firestore in any case.
- **`src/app/routes/SellerApplicationPage.tsx`** — an approved seller
  visiting `/seller/apply` now redirects straight to `/seller-studio`
  (`<Navigate replace />`) instead of showing a status card; a SELLER can
  never re-apply.

### Seller-authorization persistence invariant (verified, never violated)

```
PENDING seller:  Auth claim CUSTOMER · users/{uid}.role CUSTOMER · sellers/{uid}.status PENDING
APPROVED seller: Auth claim SELLER   · users/{uid}.role SELLER   · sellers/{uid}.status APPROVED
```

The browser never grants SELLER from Firestore alone (`AuthProvider`/
`ensureUserProfile` read only the unforgeable ID token claim for
authorization); `users/{uid}.role` is a convenience mirror only, never
trusted by rules or client code. The only path from PENDING to APPROVED is
`functions/src/promoteSeller.ts` (unchanged, pre-existing); the only path
that *restores* an already-APPROVED account's claim/mirror after data drift
is `reconcileRoles.ts` above — neither can ever demote SELLER to CUSTOMER or
invent approval.

### Real owner restart verification

Performed against the real owner account — UID `ppqIaap00MbYNY9RGDQmTwBb54bP`
(`bm440946@gmail.com`) — never a substitute test account:

- **Three full PENDING-state restart cycles** (export → full stop → restart
  emulators + Vite → sign in): 11/11 checks each — same UID/email, Auth claim
  still `CUSTOMER`, `users.role` still `CUSTOMER`, `sellers.status` still
  `PENDING`, `reviewedAt` still null, UI showed the pending state, refresh
  kept the session, zero console errors. Reconciliation correctly left the
  PENDING owner untouched on every cycle.
- **Real promotion, once,** via `promoteSeller.ts` on this exact UID: Auth
  claim `SELLER`, `users.role` `SELLER`, `sellers.status` `APPROVED`,
  `reviewedAt` populated, Seller Studio accessible, `/seller/apply` redirects
  to `/seller-studio`.
- **One additional clean restart after promotion:** same UID, claim still
  `SELLER`, `users.role` still `SELLER`, `sellers.status` still `APPROVED`,
  Seller Studio accessible, refresh kept SELLER, zero console errors —
  re-confirmed a second time after a required Firestore-rules-test detour
  (real data safely exported, moved aside, restored, and verified
  byte-for-byte intact afterward).
- **Owner artwork recovery result: NOT FOUND.** Searched read-only across
  every available snapshot (`emulator-data`, `emulator-data.backup`, the
  manually-captured `emulator-export-safe-<timestamp>` recovery evidence; no
  stray `firebase-export-*` directories exist anywhere in the project) for
  any artwork owned by the real owner UID. Zero in every snapshot checked.
  The owner has never had an artwork recorded in any snapshot this
  investigation could locate — nothing was fabricated or restored, because
  there was nothing to restore.

### Manual Windows Ctrl+C persistence verification (owner-confirmed)

This session's own automated tooling has no attached Windows console, so a
literal interactive Ctrl+C keypress could not be mechanically delivered to a
backgrounded process from here (confirmed again this session via two
independent methods — a `GenerateConsoleCtrlEvent`/`AttachConsole` attempt
and a cross-process `SIGINT` signal both terminated the target without
triggering its graceful-shutdown handler). Automated restart-cycle testing
instead used `firebase emulators:export --force` — the identical underlying
file-replacement/validation routine `--export-on-exit` calls internally —
followed by process termination, which is an equivalent proof of the
persistence mechanism but not a literal keypress. **The owner then
personally performed the real Ctrl+C shutdown/restart workflow in their own
terminal and confirmed PASS** — the one verification only the owner's own
machine could provide, now done. The owner's confirmation covered, on the
real owner account, across the real restart:

- Authentication persisted (still signed in, no re-login required).
- SELLER authorization persisted (Auth claim, `users/{uid}.role`, and
  `sellers/{uid}.status` all still `SELLER`/`APPROVED` after restart).
- Seller Studio remained accessible (guard did not fall back to CUSTOMER).
- The newly created DRAFT artwork persisted across the restart.
- The emulator snapshot import/export worked correctly end to end (export
  on shutdown, import on the next startup, no data loss or corruption).

### Tests

- **Frontend:** 320/320 passing (46 files) — including `ensureUserProfile`'s
  never-downgrade guarantee and the `/seller/apply` → `/seller-studio`
  redirect (via real routing, not a mocked navigate).
- **Functions:** 22/22 passing (5 files) — `reconcileRoles.test.ts` (9,
  including the exact-literal-claim proof) and `verifyEmulatorState.test.ts`
  (4, new, confirming it never calls a write method) alongside the
  pre-existing suites.
- **Firestore rules:** 82/82 passing — re-run against a disposable emulator
  instance (real owner data exported, moved aside, restored, and re-verified
  afterward) since the rules-test harness shares one live Firestore
  project/emulator and wipes it in `beforeEach`.
- **Build:** succeeds. **Typecheck/lint:** clean (pre-existing advisory
  warnings only).

### Known limitations

- A literal interactive Ctrl+C could not be mechanically simulated from this
  session's own tooling (see above) — mitigated entirely by the owner's own
  real-terminal verification, which is now done and PASS.
- The Functions emulator occasionally shows a transient "Cannot determine
  backend specification. Timeout" reload warning under heavy concurrent
  load; harmless (always recovers, `onUserCreate` always loads), pre-existing,
  unrelated to this fix.
- Vite-only restart independence relies on the mechanism proven with the
  real owner account in a prior verification pass within this same body of
  work, rather than a freshly re-isolated check in the owner's own final
  restart test.

## Module 02 — final completion status

- **Status:** COMPLETE.
- **Owner visual review:** PASSED (final round, real Chrome DevTools).
- **302×531 regression:** PASSED — Home/Sign In/Sign Up load and
  transition without clipping; scroll resets correctly on every route
  change; bottom nav and drawer stable.
- **Responsive shell/navigation verification:** PASSED across the full
  official matrix (320×568, 375×667, 390×844, 412×915, 768×1024,
  1024×768, 1366×768) plus the ~302×531 stress case.
- **Route scroll-reset regression:** PASSED — client-side navigation
  between Home, Sign In, and Sign Up (including via the drawer) each
  resets the mobile `<main>` scroll container and the desktop
  window scroll to the top.
- **Final quality gate:** `typecheck` clean; `lint` clean (pre-existing
  warnings only, no errors); `test -- --run` 42/42 passed (16 files);
  `build` succeeds; `git diff --check` clean.
- **Checkpoint commit:** `77cee05` (`77cee056d025998612c3ad921ba95b459c14aa82`).

## Module 02 planning decisions (approved, pre-implementation)

Recorded now because they are durable product/architecture rules, not
just Module 02 detail — they will govern every later module's navigation
and any "not yet built" affordance, not only this one:

- **No fake/dead navigation.** The nav config may list future
  destinations (Marketplace, Categories, Auction, Wishlist, Cart, Orders,
  Seller Studio, Admin, etc.), but each item carries an explicit
  enabled/available flag. Only routes that actually exist render as
  clickable nav; future items stay hidden until their module ships. No
  placeholder pages are created merely to make a link "work."
- **AI Assistant launcher is an honest non-functional affordance in
  Module 02.** No simulated chat, no fake replies, no fake panel implying
  the assistant works. Rendered as a clearly disabled/`aria-disabled`
  state (e.g. "ArtVault AI — available in a later module"), not a
  clickable fake "coming soon" interaction. Becomes genuinely interactive
  only when the AI Assistant module is built.
- **View in AR is style/contract only in Module 02.** No fake AR launch,
  no simulated camera placement. Rendered explicitly unavailable (or used
  only in internal component demos) until the real AR module exists.
- **Official branding asset does not exist in the repository yet.**
  Confirmed by direct filesystem check (`public/` has only the default
  Vite `favicon.svg`/`icons.svg`; no logo/brand file anywhere in `src/` or
  `public/`) — the colorful "ArtVault A / Art Beyond Limits" reference
  the owner shared exists only as chat-pasted images, not a repo asset.
  Module 02 will **not** invent or generate a substitute final logo. It
  prepares the branding asset path/contract and uses, at most, a clearly
  documented temporary text/monogram placeholder if development needs
  something on-screen meanwhile. **Action item for the owner:** add the
  approved logo file(s) to the repository (e.g. `public/brand/`) so
  Module 02 (or a follow-up pass) can wire in the real asset.
- **Mobile safe areas are first-class from the start.** Bottom
  navigation and the floating AI launcher account for
  `env(safe-area-inset-bottom/left/right)` and must never overlap the
  bottom nav, device safe areas, or other important controls.
- **Module 01 authentication logic is frozen for Module 02.** Only
  presentation may change (markup/classes). Business logic, Firebase
  integration, role-claim behavior, persistence, and route protection are
  untouched unless an actual regression is found — and if one is, it gets
  fixed and re-verified with the same rigor as the Module 01 review, not
  silently patched.
- **Design system scope stays disciplined.** Build only what the app
  shell, auth pages, navigation, and near-term page composition genuinely
  need now; component APIs may be shaped for later extension, but nothing
  is built solely because a future module *might* want it.

## Module 02 mobile correction pass (pending final owner review)

Desktop Home/Sign In/Sign Up were approved as-is; this pass is mobile-only,
following the owner's manual inspection down to ~302×531:

- **AI launcher collision with content, fixed:** a `position: fixed`
  floating button will always visually sit on top of whatever page content
  scrolls beneath its screen position, regardless of how much bottom
  padding follows that content — padding only affects reachability, not
  what renders where before scrolling. Since the launcher is a
  non-functional placeholder, usability wins: it now hides itself below
  `700px` viewport height (`[@media(min-height:700px)]:flex`), which is
  precisely where a tall form (Sign Up) risks not fitting a short screen.
  Still visible normally at every official viewport height (≥768) and on
  desktop.
- **Bottom nav covering form content, fixed at the architecture level, not
  with more padding:** the real fix was structural. Below `lg`, the shell
  is now `h-screen flex flex-col overflow-hidden` with `<main>` as the
  only `overflow-y-auto` region — content can no longer render behind the
  now-non-fixed bottom nav (a normal flex sibling, not an overlay),
  because `<main>`'s own box structurally ends before the nav begins.
  Desktop (`lg`+) is unchanged: `lg:h-auto lg:min-h-screen
  lg:overflow-visible` restores plain whole-page scroll exactly as
  approved. One honest trade-off: bounding `<main>`'s scroll on mobile
  means the page no longer scrolls at the true document/body level there,
  which on some real mobile browsers can affect address-bar
  auto-hide-on-scroll behavior — a known, minor trade-off of this
  (industry-standard) pattern, not verifiable from a headless browser.
- **Crowded mobile header, fixed:** the top bar's Sign in/Sign up links
  are now hidden below `sm` (640px) — the drawer (opened via the
  hamburger, already offering both) covers that width range, so the
  mobile header stays to just hamburger + brand mark instead of hamburger
  + logo + two links fighting for space.
- **Auth card padding, tightened for small phones:** `Card` padding
  `p-6` → `p-4 sm:p-6`, section vertical padding `py-8` → `py-6 sm:py-8`,
  giving narrow phones more usable field width without shrinking any
  control below the 44px touch-target floor.
- **Verified 65/65 real-browser checks** across the official matrix
  (375×667, 390×844, 412×915, 768×1024, 1024×768, 1366×768) plus
  320×568 and the reported ~302×531 stress case: no horizontal overflow;
  zero collisions between the AI launcher, the bottom nav, and any real
  control (inputs/buttons/links) at any size; the Sign Up form's
  "Sign in" link fully reachable and unobstructed after scrolling at
  every size; drawer open/focus/Escape-close intact; a real sign-up +
  refresh through the restyled/restructured mobile shell still reaches
  `/account` and persists (Module 01 regression); desktop sidebar and AI
  launcher confirmed unchanged at 1366×768. 0 genuine console errors.
- **Test-methodology note:** two rounds of false positives were found and
  fixed in the *verification script itself* (not the app) along the way:
  `getBoundingClientRect()` ignores ancestor scroll-clipping, so a field
  scrolled out of `<main>`'s visible area needed to be excluded/clipped
  before collision-checking; and a naive AABB overlap check treated
  perfectly adjacent (touching, zero-area) edges as collisions, needing
  `<=`/`>=` instead of `<`/`>`. Both confirmed via direct screenshot
  inspection before being called false positives, not assumed.

## Module 02 small-viewport correction pass (pending final owner review)

Despite the "65/65" result above, the owner's own manual inspection in
Chrome DevTools at ~302×531 found real clipping on Home, Sign In, and Sign
Up. Investigated rather than dismissed — the report was correct; the
verification method had two real gaps.

- **Root cause:** React Router does not reset the scroll position of a
  custom scroll container on client-side (`<Link>`) navigation — its
  built-in scroll restoration only covers the window/document, which isn't
  the active scrolling element on mobile (that's the bounded `<main>`
  introduced in the prior correction pass). Empirically reproduced: scroll
  Sign Up down, click a real `<Link>` to Home, and `main.scrollTop`
  remained at its old value instead of resetting to 0 — so Home's content
  rendered shifted upward, behind the fixed top bar. This is a real,
  state-dependent bug: it only appears after a scrolled navigation, never
  on a fresh page load, which is why a fresh `page.goto()` never showed it.
- **Fix — `src/app/layouts/AppShell.tsx`:** added a `ref` on `<main>` and a
  `useEffect` keyed on `useLocation().pathname` that resets
  `mainRef.current.scrollTop = 0` (the mobile bounded-scroll case) and
  `window.scrollTo(0, 0)` (the desktop whole-page-scroll case) on every
  actual path change. Deliberately scoped to `pathname` only (so a
  query-string-only change on the same route doesn't reset scroll) and
  touches only this one container plus the window — it does not reset any
  other, currently-nonexistent nested scroll region (e.g. a future modal's
  own scroll), per instruction not to globally destroy legitimate nested
  scroll state. (`scrollTop = 0` was used instead of `Element.scrollTo()`
  because jsdom, used by the Vitest suite, doesn't implement
  `Element.prototype.scrollTo` and threw in tests; `scrollTop` assignment
  is universally supported and equivalent for a vertical-only reset.)
- **Why the previous "65/65" pass missed it:** every check in that pass
  used `page.goto(url)`, which is always a fresh navigation and naturally
  starts scroll at 0 — the suite never once simulated a real user clicking
  through the SPA via `<Link>` elements between routes, which is the only
  way this bug manifests.
- **A second, related test-script bug found and fixed in this round (not
  a product bug):** an unscoped `document.querySelectorAll('a')` searching
  for text like "Sign in" could silently match the wrong element — the top
  bar keeps a real `<a href="/sign-in">`, correctly CSS-hidden below `sm`
  by a `hidden sm:flex` wrapper (the bottom nav and drawer already offer
  it at that width, approved in the prior pass) — which still has a real,
  zero-size `getBoundingClientRect()`. A DOM-order match can pick that
  hidden node over the real, visible page content, producing a false PASS
  because a zero-height rect trivially satisfies "not clipped." Fixed by
  scoping all such text lookups to `<main>` only, since page-content
  clipping checks only ever care about what's inside the scroll container
  anyway. The same ambiguity also broke `page.click('a[href="/sign-in"]')`
  in the new route-transition test (Playwright picked the hidden instance
  and timed out) — fixed by clicking only the visible instance.
- **Re-verified, this time including real client-side navigation:** full
  official matrix (320×568, 375×667, 390×844, 412×915, 768×1024, 1024×768,
  1366×768) plus ~302×531, fresh-load boundary checks against both the top
  bar and bottom nav for Home/Sign In/Sign Up; explicit client-side route
  transitions (Sign Up, scrolled → Home; Home → Sign In; Sign In → Sign
  Up; Home → Sign Up via the drawer, since the bottom nav intentionally
  has no direct Sign Up link at this width) each confirming
  `main.scrollTop` resets to 0 and no header clipping; Sign Up's tail
  (Create account button, "Sign in" link) confirmed fully visible above
  the bottom nav with a real gap when scrolled to the bottom; drawer
  overflow/dialog/Escape-close unaffected; Module 01 sign-up + refresh
  regression still reaches and persists `/account`. 115/115 checks passed.
  Additionally confirmed by direct visual inspection of screenshots (not
  only measured rects) at 302×531: Home, Sign In, Sign Up (top and
  scrolled-to-bottom), and the exact scrolled-Sign-Up→Home transition —
  all show clean, unclipped content with a visible gap below the top bar.
- **Full quality gate re-run after the fix:** `typecheck` clean; `lint`
  clean (pre-existing warnings only, no errors); `test -- --run` 42/42
  passed (16 files) — this surfaced and fixed a real, if
  environment-only, issue: jsdom doesn't implement `Element.scrollTo`,
  which the initial fix used and which threw in the test suite; switched
  to `scrollTop` assignment, which both jsdom and every real browser
  support; `build` succeeds; `git diff --check` clean.
- **Console/runtime errors:** 0 genuine errors across the full
  verification run (84 console messages, all filtered DevTools/Autofill
  noise).
- **Remaining limitations:** verification is headless-Chromium-based, not
  a real device; the previously-noted address-bar auto-hide trade-off
  from bounding `<main>`'s scroll on mobile still applies and still isn't
  verifiable from a headless browser.

## Module 02 owner visual correction pass (first pass, presentation polish)

After the first automated pass ("PASS"), the owner's own manual visual
review found the shell still read as a dev scaffold rather than the
approved premium identity. Corrected, presentation-only:

- **Brand presence strengthened:** `BrandLogo` now pairs a larger gradient
  monogram mark with a two-tone "Art**Vault**" wordmark (gold "Vault"),
  still documented as temporary pending the real asset — nothing final
  was invented.
- **Header decluttered:** removed the disabled search field entirely
  (was dominating the top bar and reading as an unfinished placeholder)
  rather than keeping a "(coming soon)" field — deferred to the real
  Search module as instructed.
- **Sidebar intentionality:** narrower rail, an "MENU" eyebrow label,
  and better item padding — still exactly the same single real `Home`
  link, no destinations invented.
- **Home copy replaced:** the developer-facing "ArtVault foundation is
  running" text is gone — now an honest premium welcome (brand tagline,
  positioning line, a plain statement that more will appear as modules
  ship) with zero fake artworks/prices/stats.
- **AI launcher identity:** added a gold ring and a small "AI" badge so
  it reads as a deliberate ArtVault entry point rather than a generic
  circle — still fully disabled, no panel, no chat.
- **Auth pages integrated:** added a subtle brand-gradient backdrop and a
  gold top-border accent on the sign-in/up `Card` so they feel part of
  the same shell — Module 01 logic untouched.
- **Real bug caught during this pass:** `Input`/`TextArea`/`SearchInput`
  used a *white*-tinted border token meant for dark surfaces, on their
  *light* `bg-surface-light` background — nearly invisible in practice.
  Added a dedicated `--color-border-on-light` token and fixed all three.
- Re-verified: 42/42 tests passing (2 test files updated for the new,
  intentionally different Home/BrandLogo text — `BrandLogo`'s two-tone
  wordmark splits "Art"/"Vault" across elements, which the default
  `getByText` string matcher can't reassemble — a known Testing Library
  limitation, not a bug; fixed by asserting on the `aria-label` instead),
  typecheck/lint/build clean, and a fresh 24/24 responsive re-check
  (375×667 through 1366×768) confirmed no regressions plus the search
  field's genuine absence from the rendered DOM.

## Module 02 implementation (first pass, automated review — PASS)

Built exactly per the approved, corrected plan:

- **Design tokens** (`src/index.css`, Tailwind v4 `@theme`): dark navy
  shell, purple/violet primary, gold/orange accent, radius/shadow/z-index
  scale, one visible-focus treatment. Verified `--ease-*` generates real
  Tailwind utilities; `--duration-*` does not (not a supported v4
  namespace) — motion uses Tailwind's built-in `duration-*` scale instead.
- **Shared UI** (`src/shared/ui/`): Container, ResponsiveGrid, Button,
  IconButton, Input, TextArea, SearchInput, Badge, Chip, Avatar, Card,
  Modal, Drawer, Dropdown, Spinner, Skeleton, EmptyState, ErrorState,
  PageHeader, SectionHeader, Toast/useToast, ViewInArBadge — scoped to
  exactly what the shell/nav/auth pages need, nothing built speculatively.
- **Responsive shell** (`src/app/layouts/`): `AppShell` composes
  `AppTopBar` (search disabled/honest, profile dropdown or sign-in/up),
  `AppSidebar` (desktop, `lg`+), `AppBottomNav` + `NavDrawer` (mobile),
  replacing the old flat `RootLayout`.
- **Role-aware nav** (`src/app/navigation/`): `navItems.ts` + `useNavItems`
  — every item carries `status: 'available' | 'comingSoon'`; only
  `available` items (`Home`, `Account`) render as real links today.
  Marketplace/Categories/Auction/Wishlist/Cart/Orders/Seller
  Studio/Admin exist in the data only, genuinely hidden until their
  module ships — no dead links, no placeholder pages.
- **AI Assistant launcher** (`src/features/ai/`): fixed floating button,
  `disabled`/`aria-disabled`, labeled "available in a later module," no
  panel, no chat, no API call. Safe-area-aware positioning
  (`env(safe-area-inset-bottom/right)`), verified in a real browser to
  never overlap the mobile bottom nav at any required width.
- **View in AR contract** (`ViewInArBadge`): visually real, functionally
  inert pill — `aria-disabled`, no camera/placement simulation.
- **Branding:** confirmed (filesystem check) no logo asset exists in the
  repo; `BrandLogo` renders a documented temporary gradient text/monogram
  placeholder; `public/brand/README.md` records the expected real-asset
  path contract for when the owner adds it.
- **Auth visual upgrade:** `SignInForm`/`SignUpForm`/`SignOutButton`/
  `SignInPage`/`SignUpPage`/`AccountPlaceholderPage` restyled onto the new
  primitives — every `aria-*`, label, role, and `autoComplete` preserved
  exactly. `SignOutButton` gained one additive optional `onClick` prop
  (so the mobile drawer can close itself after sign-out) — the sign-out
  call and its error handling are unchanged.
- **Code-splitting:** `SignInPage`/`SignUpPage`/`AccountPlaceholderPage`
  are now `React.lazy` + one `Suspense` boundary in `AppShell`. Confirmed
  working (separate ~0.7-0.8 kB chunk files each) but — reported honestly,
  not overclaimed — this does **not** shrink the ~925 kB main chunk
  materially, because the dominant contributor is the Firebase SDK (needed
  eagerly at startup for `AuthProvider` regardless of route), not the
  auth pages. See Technical debt.
- **Independent review + fixes performed before verification:** an
  `asChild`/Slot-polymorphism pattern was mistakenly referenced on
  `Button`/`DropdownItem` for link-styled nav items (invalid — nesting a
  `Link` inside a `<button>` is invalid HTML besides); fixed by exporting
  `buttonClassName`/`dropdownItemClassName` helpers instead. A real
  contrast bug (`text-text-on-light` used for heading text on the dark
  `Card` surface in `SignInPage`) was caught and fixed before browser
  testing.
- **Real-browser verification** (Playwright Chromium, `claude-in-chrome`
  still unavailable this session): 24/24 checks passed across
  375×667/390×844/412×915/768×1024/1024×768/1366×768 — no horizontal
  overflow at any size, bottom nav shown with sidebar hidden below `lg`
  and vice versa above it, AI launcher never overlaps the bottom nav
  (confirmed via real measured bounding rects, not assumption), mobile
  drawer opens/moves focus in/closes on Escape, auth forms fit and
  function at 390px width. A real sign-up + refresh was re-run through
  the fully restyled forms/shell as the Module 01 regression check —
  still reaches `/account` and persists correctly. 0 genuine console
  errors throughout.
- **Environment note:** the Functions emulator's first load attempt
  failed with the same "Cannot determine backend specification" message
  as before, on an otherwise-still-CommonJS build (confirmed unchanged) —
  consistent with this machine's already-documented slow/flaky cold start
  under load, not a regression of the Module 01 ESM fix.

## Module 03 — Customer Account & Profile Foundation (COMPLETE)

**Status:** **COMPLETE — owner-approved.** Implementation finished,
independently reviewed, real-browser verified, then further verified by the
owner's own full manual pass (see "Final owner approval" below) across
three follow-up review rounds (Edit Profile responsive sizing, the sign-up
"Network error" root cause, and Windows Java/emulator-persistence
reliability), each investigated to a real root cause and fixed — not
patched around. Committed; see `git log` for the commit hash.

### Final owner approval

The owner completed a full manual verification pass and approved the
module outright, with no further owner-visible blockers reported:

- Firebase emulator starts correctly with Java 21.
- Emulator persistence works across a real restart.
- The same user account can sign in again after that restart.
- Customer profile data (display name, phone, bio) persists correctly.
- Account dashboard works on desktop.
- Account dashboard works at a very small mobile viewport (~302×531).
- Edit Profile's responsive modal (sized/scrolled/sticky-footer fix) works.
- Edit Profile Save/Cancel remain reachable without hunting for them.
- A profile update succeeds and persists.
- Success feedback (toast) displays correctly.
- Profile-completion status updates correctly once display name, phone, and
  bio are all present.
- The Module 03 responsive issues found during review were fixed.
- The emulator-persistence issues found during review were fixed.

### Final Module 03 deliverables

- **Customer account dashboard** (`src/app/routes/AccountPage.tsx`) —
  loading/error/missing/loaded states, role-aware header, responsive
  desktop/mobile layout, honestly-disabled future-section reservations (no
  fake navigation).
- **Profile model** — `users/{uid}` extended (`src/features/auth/types.ts`)
  with `photoURL`, `phoneNumber`, `bio`, `profileCompleted`; full shape
  initialized at account creation (`functions/src/index.ts`).
- **Profile repository/hooks** (`src/features/account/api/
  profileRepository.ts`, `.../hooks/{useUserProfile,useUpdateProfile}.ts`)
  — one real-time listener per signed-in uid, defensive read-side mapping,
  a write-side allow-list mirroring the Firestore rule exactly.
- **Real-time profile updates** — Firestore `onSnapshot`-backed; the
  account header reflects a saved edit immediately, no manual refetch.
- **Edit Profile** (`src/features/account/components/EditProfileModal.tsx`)
  — dirty-gated Save, validation, saving state, success toast, inline error
  preserving input on failure, unsaved-changes confirm-on-close; restructured
  onto a sticky-header/single-scroll-body/sticky-footer `Modal` so Cancel
  and Save never require hunting for them, at any viewport down to ~302×531.
- **Display name, phone, bio** — editable, validated (Zod client-side,
  mirrored server-side in `firestore.rules`).
- **Read-only email** — displayed, never editable in this module (no
  reverification flow exists yet).
- **Read-only role** — displayed, never editable, no client path to
  authorization escalation.
- **Avatar/fallback initials** (`src/shared/ui/Avatar.tsx`) — deterministic
  initials fallback, real `photoURL` support (no upload feature yet).
- **Profile completion** — deterministic client computation, UX metadata
  only, never a security/authorization signal (enforced as a type-only
  check, `bool`, in the Firestore rule).
- **Firestore security rules** (`firestore.rules`) — real field-level
  allow-list (`diff().affectedKeys().hasOnly([...])`), not just an identity
  check; schema/type/length validation in the rule itself; `updatedAt`
  required to be a genuine `serverTimestamp()`.
- **Firestore rules tests** (`firestore-tests/users.rules.test.ts`) —
  21/21 passing against the real Local Emulator Suite, covering every
  required ownership/protected-field/schema/mass-assignment/full-overwrite
  scenario.
- **Authentication regression** — full Module 01 flow (sign-up → account →
  refresh → edit → refresh → sign-out → redirect → sign-in) re-verified in
  a real browser; one genuine pre-existing defect found and fixed
  (`src/features/auth/api/authClient.ts` — Firestore `displayName` wasn't
  synced from the Auth trigger's pre-`updateProfile()` snapshot).
- **Responsive account UI** — verified across 320×568, 375×667, 390×844,
  412×915, 768×1024, 1024×768, 1366×768.
- **Responsive Edit Profile modal** — verified across the same matrix plus
  the ~302×531 stress case (98/98 real-browser checks in the fix pass).
- **Emulator persistence workflow** (`npm run emulators` →
  `scripts/start-emulators.mjs`) — auto-import/export against
  `./emulator-data`, graceful-shutdown-aware (never force-kills its child).
- **Windows Java 21 development guidance** (`docs/DEPLOYMENT.md` →
  "Permanent Windows Java setup") — one-time `JAVA_HOME`/`Path` fix, plus a
  pre-flight check in the launcher itself that refuses to proceed with a
  clear error instead of a confusing Firebase-internal one.
- **Emulator data recovery/safety behavior** — the launcher detects and
  auto-recovers a stranded export (a real, reproduced Windows file-lock
  race between Firebase's export-replace and a running `npm run dev`'s
  file watcher) at both startup and shutdown, documented in
  `docs/DEPLOYMENT.md`.

### Known limitations

- Avatar upload, email change/reverification, and seller onboarding are
  all explicitly out of scope for this module (see "Deferred functionality").
- The theoretical backward-compatibility gap for any Firestore `users/{uid}`
  document that predates this module's schema is documented in
  `docs/DATABASE.md` — moot today since nothing has ever been deployed.
- One advisory-only lint warning (`react/set-state-in-effect` on
  `useUserProfile.ts`) — the same shape React's own data-fetching-effect
  docs use; not restructured further for a cosmetic lint preference.
- The emulator-data recovery safety net cannot complete while `npm run dev`
  is actively holding a lock on the export path — data is never lost in
  that case, just left in a `firebase-export-*/` staging folder until
  `npm run dev` is stopped and the emulators restarted (documented).
- This session's tooling has no attached Windows console, so a literal
  interactive Ctrl+C keypress could not be mechanically verified from here;
  the equivalent code path (`child.on('exit')` triggering export
  completion/recovery) was verified directly instead. A real Ctrl+C in the
  owner's own terminal is the one thing only their machine can confirm —
  now moot, since the owner's own manual verification pass covered exactly
  this.

### Deferred functionality (explicitly out of scope for Module 03)

Avatar upload (Storage), email change/reverification flow, seller
onboarding ("Become a seller"), and every marketplace/cart/orders/
seller-studio/admin surface reserved (but disabled) in the account sections
grid — all belong to later modules per the Module 03 scope rule.

### Owner-review fix: Windows Java 21 detection + emulator-data recovery

`npm.cmd run emulators` failed with "firebase-tools no longer supports Java
version before 21" (this machine's raw PATH resolves an old Java 8 before
the installed JDK 21), and the launcher separately reported "no previous
emulator export found" even though persistence had previously been
configured and tested.

- **Java detection added — `scripts/start-emulators.mjs`:** checks
  `java -version` (deliberately single-dash — Java 8 doesn't understand
  `--version` and would just error out, which would defeat detecting
  exactly that case) before starting anything, preferring
  `%JAVA_HOME%\bin\java.exe` if `JAVA_HOME` is set (never a hardcoded,
  machine-specific path). Refuses to proceed with a clear, actionable error
  if Java is missing or below 21. If `JAVA_HOME` is set, its `bin/` is also
  prepended to the *spawned child's* PATH, so the emulator suite itself
  reliably uses the right Java even before a user finishes the full manual
  PATH reorder.
- **Documented — `docs/DEPLOYMENT.md` → "Permanent Windows Java setup":**
  step-by-step `JAVA_HOME`/`Path` configuration via Windows' own
  "Edit environment variables for your account", with `java --version` /
  `where.exe java` verification — a one-time fix, no more temporary
  `$env:`/`export PATH=...` commands needed in any future terminal.
- **`emulator-data` detection root cause — genuinely investigated, not
  assumed:** the detection *logic* itself was correct throughout. The
  directory had actually gone missing: firebase-tools' export mechanism
  replaces an existing `./emulator-data` by removing it first, then
  renaming a fresh `firebase-export-<timestamp><random>/` staging directory
  into place — and on this machine, if anything else holds even a lock on
  that path at that exact moment (empirically confirmed, repeatedly: a
  running `npm run dev`'s file watcher, watching this same project root),
  that final rename fails with `EPERM`. The old directory is already gone
  by then, so nothing is lost, but the new data is left stranded in the
  staging directory. Found two such stranded exports on disk when
  investigating — one contained genuine data (including the owner's own
  test account) and was recovered; the launcher's detection then correctly
  found and imported it.
- **Fixed — the launcher now recovers this automatically, in two passes:**
  once at startup (catches a previous run's export that got stranded, and
  runs before this process has touched anything, the least-contested
  moment) and once after shutdown if `--export-on-exit` itself failed the
  same way, each with a short bounded retry. Confirmed by deliberately
  reproducing the exact race (exporting while `npm run dev` was running)
  and watching the launcher detect, retry, and — once `npm run dev` was
  stopped — successfully recover the stranded data into `./emulator-data`
  with no manual intervention, then correctly import it on the next start.
  When `npm run dev` is still actively holding the lock, recovery can't
  complete (documented, with the exact recovery step, in
  `docs/DEPLOYMENT.md`) — the data is never lost, just left in the staging
  directory until you stop `npm run dev` and start the emulators again.
- **Export safety / Ctrl+C:** the launcher's existing design was already
  correct here (never force-kills the child; waits for it to exit before
  the wrapper itself exits) and is unchanged in shape — the new recovery
  logic is a genuine data-loss safety net for the race above, not a
  replacement for graceful shutdown. `firebase-export-*/` was added to
  `.gitignore` alongside `emulator-data/` (same category of local-only
  artifact).
- **One honest limitation, carried over from the prior fix:** this
  session's tooling still has no attached Windows console, so a literal
  interactive Ctrl+C keypress could not be mechanically delivered here —
  the full persistence cycle (create account → edit profile → stop → data
  exported → restart → import → sign in → data intact) was verified for
  real by stopping the emulator process directly (which exercises the
  exact same `child.on('exit')` recovery/export-completion code path a
  real Ctrl+C would), not by simulating the keypress itself. A real
  interactive Ctrl+C in the owner's own terminal remains the one thing only
  the owner's own machine can fully confirm.
- **Full persistence test performed and passed** with a fresh account and
  bio set to exactly "artist forever" per instruction — see the Owner
  Review section of this report for the full sequence and result.

### Owner-review tooling fix: missing `npm run emulators` script

The owner tried `npm run emulators` (documented informally as the expected
way to start the Local Emulator Suite) and got "Missing script: emulators"
— no such script had ever been added to `package.json`; `docs/DEPLOYMENT.md`
only ever documented the raw `npx firebase-tools emulators:start` command.

- **Added:** `"emulators": "node scripts/start-emulators.mjs"` to
  `package.json` (existing scripts untouched).
- **Added — `scripts/start-emulators.mjs`:** detects a previous export via
  `emulator-data/firebase-export-metadata.json` (the file firebase-tools
  itself writes on every successful export — a reliable presence signal,
  not an assumption); if found, starts with `--import=./emulator-data
  --export-on-exit=./emulator-data` and prints "importing saved data"; if
  not, starts with just `--export-on-exit=./emulator-data` and prints
  "starting fresh". Prefers a local `node_modules/.bin/firebase` if one
  exists, otherwise falls back to `npx firebase-tools` (this repo has no
  local firebase-tools devDependency today, so it currently always takes
  the npx path — the local-CLI check is there for forward compatibility).
  Spawned with `shell: true` (required on Windows to resolve the `.cmd`
  shims) and the full command built as one string rather than an args
  array, avoiding Node's DEP0190 deprecation warning about unescaped
  shell-array arguments — safe here since every argument is a fixed,
  code-controlled flag, never user input. The wrapper does not exit on its
  own `SIGINT`; it only exits once its child process has, so `npm run
  emulators` doesn't return control to the terminal before Firebase's own
  graceful shutdown/export has actually finished.
- **Added `emulator-data/` to `.gitignore`** (alongside the existing
  Firebase Emulator Suite entries) — local export data, never committed.
- **Verified `npm run emulators` starts successfully** — first run showed
  "No previous emulator export found... starting fresh" and reached "All
  emulators ready."
- **Full persistence test performed and passed:** created a real account,
  edited its profile (phone + bio) through the live UI, exported the
  emulator data, stopped every emulator process, ran `npm run emulators`
  again — it printed "Found a previous emulator export... importing saved
  data" and the logs confirmed a real Firestore/Auth import — then signed
  in with the same account through the live UI again: displayName, email,
  phone, and bio all came back exactly as saved. Confirms the core
  requirement (profile data survives an emulator restart) end-to-end.
- **One honest caveat on how the export step was triggered:** this
  session's tooling runs each shell command through an isolated,
  non-interactive execution layer with no attached Windows console, so a
  literal Ctrl+C keypress could not be mechanically delivered to the running
  emulator process the way a real terminal would (confirmed directly — a
  `GenerateConsoleCtrlEvent`/`AttachConsole` attempt failed because there
  was no console to attach to). The export itself was instead triggered via
  `firebase emulators:export` against the live running suite — the exact
  same underlying export routine `--export-on-exit` calls internally, so
  the data-persistence guarantee this task cares about is verified for
  real. The wrapper's own "wait for the child to exit before exiting itself"
  logic was verified by code review and by observing a real child-process
  exit propagate correctly, but a literal interactive Ctrl+C in a real
  terminal is the one thing only the owner can fully confirm on their own
  machine.

### Owner-review fix: Edit Profile modal too large on mobile

During the owner's own manual review, the Edit Profile modal was found to
occupy nearly the entire viewport on mobile (reported at ~302×531): too much
vertical space per field, and Save/Cancel could require excessive scrolling
to reach. Fixed as a presentation-only change — no profile functionality,
validation, or security logic touched.

- **Root cause:** `Modal` (`src/shared/ui/Modal.tsx`) had no height cap and
  no internal scroll region — header, fields, and the Cancel/Save row were
  all one unbounded block centered by an unconstrained flex wrapper. When
  content was taller than the viewport, there was nothing to scroll (the
  wrapper itself never got `overflow-y-auto`), so the header and/or footer
  could render fully off-screen. The background page could also still
  scroll behind the open modal (no scroll lock).
- **Fix — `src/shared/ui/Modal.tsx`:** restructured into a fixed-height flex
  column — a `shrink-0` header, exactly one scrolling body
  (`flex-1 overflow-y-auto`), and an optional new `footer` prop
  (`shrink-0`, rendered outside the scrolling region so it — and any action
  buttons in it — stay visible while the body scrolls). Sized
  `max-h-[calc(100dvh-24px)]` / `w-full` inside `p-3` outer padding on
  mobile (≈ `calc(100vw-24px)` × `calc(100dvh-24px)`, matching spec) and
  `sm:max-h-[85vh]` / `sm:max-w-[460px]` inside `sm:p-4` outer padding on
  desktop (≈ `calc(100vw-32px)` max-width, 440–500px target width, 80–85vh
  target height). Added a background-scroll lock (`document.body.style
  .overflow = 'hidden'` while open, always restored on close/unmount) since
  Modal previously had none. This is a general primitive improvement, not
  Edit-Profile-specific — safe because `Modal` currently has exactly one
  real consumer (`EditProfileModal`).
- **Fix — `src/features/account/components/EditProfileModal.tsx`:** the
  Cancel/Save button row moved out of the scrolling `<form>` into `Modal`'s
  new `footer` prop (Save now submits via `onClick={handleSubmit(onSubmit)}`
  directly rather than native `type="submit"` form-nesting, since it's a
  sibling of the form now, not a descendant — avoids any native
  form-association ambiguity). Email/Role — still read-only, still present,
  not removed — now sit side-by-side in a two-column row at `sm:` and up
  (single column on narrow phones) to save vertical space. Field gaps
  tightened (`gap-3 sm:gap-4`, was `gap-4` always).
- **Fix — `src/shared/ui/TextArea.tsx`:** default height reduced from
  `min-h-24` to `min-h-20 sm:min-h-24` (Bio is its only real consumer).
- **Accessibility preserved, verified in a real browser:** focus trap still
  covers the relocated footer buttons (confirmed via full Tab-order replay
  including Cancel and Save), focus still lands on Close on open, Escape
  still closes (through the same unsaved-changes confirm when dirty), focus
  still returns to the Edit Profile trigger on close, `aria-invalid`/
  `aria-describedby` still present and correctly wired on validation
  errors.
- **Real-browser responsive verification** (Playwright Chromium) across
  302×531, 320×568, 375×667, 390×844, 412×915, 768×1024, 1366×768 — **98/98
  checks passed**: modal fits the viewport at every size, heading and Close
  visible, all five fields (Display name, Phone, Bio, Email, Role) usable/
  readable, Cancel and Save reachable *without* scrolling to them (the new
  sticky footer), no horizontal overflow, background scroll locked while
  open and restored on close, Save button height ≥44px. A separate
  accessibility-focused pass (8/8 checks) confirmed the focus-trap/Escape/
  focus-return/aria-invalid/aria-describedby behavior above.
- **Quality gate re-run:** typecheck clean; lint clean (same 8 pre-existing/
  advisory warnings, no new ones); full test suite 96/96 (up from 93 — 4 new
  `Modal.test.tsx` cases: scroll-lock on open, scroll-lock restored on
  close, footer renders outside the body, no footer region when none is
  passed); build succeeds; `git diff --check` clean; Firestore rules 21/21
  (unaffected — this fix touched no rules-relevant code).
- **Files changed for this fix:** `src/shared/ui/Modal.tsx`,
  `src/shared/ui/Modal.test.tsx`, `src/shared/ui/TextArea.tsx`,
  `src/features/account/components/EditProfileModal.tsx`.

### Owner-review blocker found and fixed: sign-up "Network error"

During the owner's own manual review, sign-up on a fresh `npm run dev`
consistently failed with "Network error — check your connection and try
again." Investigated rather than dismissed as a real internet problem, per
instruction.

- **Root cause:** the Firebase Auth Emulator (`127.0.0.1:9099`) was not
  running/reachable at the moment the owner tested. Firebase's client SDK
  reports this exact condition with the same error code
  (`auth/network-request-failed`) it would use for a genuine internet
  outage — the SDK cannot distinguish "no internet" from "the local
  emulator isn't up," and the app's error mapping didn't either, so it
  showed the same generic, actively misleading message either way.
  Confirmed by direct reproduction: with the emulators genuinely
  unreachable, the exact reported symptom reproduces immediately; with the
  emulators running, the identical sign-up flow succeeds end-to-end with
  zero errors — proving the account-creation code path itself was already
  correct and this was never a code defect in the sign-up logic.
- **Fix — `src/features/auth/api/authErrors.ts`:** `toAuthErrorMessage` now
  checks `env.VITE_USE_FIREBASE_EMULATORS` (the same flag that decides
  whether the app connects to the emulators at all) and, only when true,
  overrides `auth/network-request-failed` with an actionable message
  naming the expected emulator endpoint and pointing at
  `docs/DEPLOYMENT.md`, instead of the generic connectivity message. A real
  production build (emulators off) still gets the honest generic message,
  since in that configuration a network failure could genuinely be the
  user's connection. Also added a safe diagnostic `console.error` logging
  only `error.code`/`error.message` for every `FirebaseError` reaching this
  function — never credentials, tokens, or other request input, since
  Firebase's own error objects never carry those.
- **Re-verified:** typecheck, lint, and the full test suite (93/93, up from
  90 — three new `authErrors.test.ts` cases: the new emulator-aware
  message, the non-emulator fallback, and the safe diagnostic log) all pass.
  Firestore rules re-confirmed 21/21 against a fresh live emulator instance.
  A full real-browser retest against the actual Local Emulator Suite
  (Playwright Chromium) covering sign-up → Firebase Auth user created →
  `users/{uid}` created with synchronized displayName → `/account` loads →
  refresh persists → sign-out → sign-in → account still correct: **8/8
  passed, 0 console errors** (excluding the new intentional diagnostic
  log line itself).
- **Files changed for this fix:** `src/features/auth/api/authErrors.ts`,
  `src/features/auth/api/authErrors.test.ts`.

### Scope implemented

Customer account dashboard, real profile editing (display name, phone, bio),
Firestore persistence with realtime updates, field-level Firestore security
rules with emulator-verified tests, avatar initials/photo fallback
foundation, loading/error/missing/loaded account states, role-aware
read-only identity display, responsive desktop/mobile account UI, a
dedicated account repository/hook layer, and full authentication + Module 02
regression testing. Marketplace, cart, orders, seller studio, and every
other later-module feature were deliberately **not** touched — the account
dashboard reserves their information architecture as genuinely disabled,
non-interactive `<button disabled aria-disabled="true">` affordances only
("Available in a later module"), matching the Module 02 no-fake-navigation
rule.

### Customer profile model (`users/{uid}`, extended)

```
uid, email, role, createdAt        — read-only from the client (unchanged from Module 01)
photoURL                            — read-only from the client (no avatar upload in this module)
displayName, phoneNumber, bio       — editable via Edit Profile
profileCompleted                    — editable, UX metadata only, never authorization
updatedAt                           — set by the client on every edit via serverTimestamp()
```

`functions/src/index.ts`'s `onUserCreate` trigger now initializes every
field above (previously only `uid`/`email`/`displayName`/`role`/
`createdAt`/`updatedAt`) so every account created from this point on has the
full shape. See `docs/DATABASE.md` for the full schema and the documented
(theoretical — nothing is deployed) backward-compatibility note for any
pre-Module-03 document.

### Writable vs. protected fields

- **Writable by the customer:** `displayName`, `phoneNumber`, `bio`,
  `profileCompleted`.
- **Protected (client can never change):** `uid`, `email`, `role`,
  `createdAt`, `photoURL`. Enforced in `firestore.rules` via
  `request.resource.data.diff(resource.data).affectedKeys().hasOnly([...])`
  — not just an identity-equality check — so no request (partial
  `updateDoc()` or a full `setDoc()` overwrite) can inject an unlisted or
  privileged field. See `docs/SECURITY.md`.

### Firestore security rules

`firestore.rules`'s `users/{uid}` update rule was rewritten from a bare
"same uid/email/role/createdAt" check into a real field-level allow-list:
changed-key restriction, per-field type/length validation
(`displayName` 2-60 chars, `phoneNumber`/`bio` within their caps or `null`,
`profileCompleted` must be `bool`), and a requirement that `updatedAt`
equal `request.time` (a genuine `serverTimestamp()`, not a client-forged
value). No indexes were needed (single-document reads/updates only).

### Firestore rules test results

`firestore-tests/users.rules.test.ts`, run for real against the Firebase
Local Emulator Suite (not mocked) — **21/21 passing**, twice-confirmed on
separate emulator instances. Covers every required scenario: unauthenticated
read blocked; owner read allowed; other-user read blocked; owner create
blocked; owner delete blocked; owner can update displayName/phoneNumber/bio
individually and combined; owner cannot change uid/role/email/createdAt/
photoURL; owner cannot inject an unlisted privileged field (`isAdmin`) or
admin/moderation metadata (`suspended`, `sellerVerified`, `moderationStatus`)
via mass assignment; a malicious full-document `setDoc()` overwrite cannot
bypass the protected-field restriction; empty/oversized displayName,
oversized bio, and a non-boolean `profileCompleted` are all rejected.

### Real-browser verification

Driven with Playwright Chromium against the live Vite dev server and the
real Firebase Local Emulator Suite (auth, firestore, functions) — **29/29
checks passed, 0 console errors**:
- Sign-up → lands on `/account` with the real display name shown (see bug
  fix below), email, Customer role badge, and an honest
  "complete your profile" hint.
- Future-section grid renders with every button genuinely `disabled` —
  no fake interactivity.
- Edit Profile: opens via a real dialog; Save starts disabled; becomes
  enabled once the form is genuinely dirty; email/role fields are
  disabled/read-only in the form; save succeeds, shows a success toast,
  closes the modal, and the header updates immediately via the realtime
  listener (no manual refetch); "Profile complete" badge appears once
  displayName + phone + bio are all present.
- Refresh persistence: display name, phone, and bio all survive a full page
  reload.
- Unsaved-changes guard: editing a field then clicking Cancel prompts a
  confirm dialog; accepting discards and closes.
- Sign-out clears the session and leaves `/account`; a direct `/account`
  navigation while signed out redirects to `/sign-in`; signing back in
  reloads the same persisted, previously-edited profile.
- Responsive matrix (320×568, 375×667, 390×844, 412×915, 768×1024,
  1024×768, 1366×768): no horizontal overflow at any size, Edit Profile
  always reachable; at 375×667 specifically, the modal's Save button stays
  within the viewport and Escape closes the dialog.

### Bug found and fixed during real-browser verification

**Root cause:** `onUserCreate` fires on Firebase Auth account creation,
*before* `authClient.ts`'s follow-up `updateProfile(credential.user, {
displayName })` call resolves — a well-known Firebase Auth trigger timing
gap, not something either call did wrong on its own. The trigger's snapshot
of the user record has no `displayName` yet, so the Firestore profile
document it creates always had `displayName: null`, even though the same
name is set on the Firebase Auth user object moments later. This existed
since Module 01 but was invisible until Module 03 built the first UI that
actually reads and displays the Firestore document's `displayName` — Module
01/02's `AccountPlaceholderPage` only ever showed `user.email` from the Auth
object directly.

**Fix — `src/features/auth/api/authClient.ts`:** after `updateProfile()`
and `waitForRoleClaim()` resolve, `signUpWithEmail` now also writes
`displayName` (plus `updatedAt: serverTimestamp()`) directly to the
Firestore profile document — a best-effort, caught-and-logged write that
never fails sign-up itself. Firestore rules already permit a user to set
their own `displayName`, so this closes the gap using the same allowed
write path Edit Profile uses, rather than changing the trigger's own
timing (which the Firebase platform doesn't allow fixing generally). Found,
root-caused, fixed, and re-verified with a fresh sign-up in the same
real-browser pass — confirmed via the Cloud Functions Admin SDK write
running first in-process, so by the time `waitForRoleClaim` resolves
client-side (which requires an additional token-refresh round trip) the
trigger's own Firestore write has almost always already completed.

### Authentication regression results

Full Module 01 flow re-verified in the same real-browser pass: sign-up →
account, refresh → still authenticated, edit profile → save → refresh →
still updated, sign-out → account inaccessible, direct `/account` while
signed out → redirected, sign-in → persisted profile loads. All passed.

### Module 02 regression results

Full frontend suite (24 files, 90 tests — up from 16 files/42 tests) passes,
including every existing Module 01/02 test unmodified in behavior (only two
files touched for Module 03 wiring: `router.tsx` swaps the placeholder route
for the real one, `AppTopBar.tsx` passes `photoURL`/`displayName` to
`Avatar`). `useNavItems`/shell/drawer/bottom-nav tests all still pass
unmodified — Module 02 navigation was not touched.

### Accessibility

Semantic headings; explicit `<label htmlFor>` pairing for read-only
Email/Role fields (implicit wrapping labels for the editable fields, matching
the existing Module 01 SignIn/SignUpForm pattern); `aria-invalid`/
`aria-describedby` on every validated field; `aria-readonly` on Email/Role;
future-section buttons are genuine native `disabled` elements (not just
visually dimmed), so they're automatically out of the tab order and announced
correctly — no ARIA simulation needed; Modal's existing focus-trap/Escape/
focus-return behavior (Module 02) is reused as-is, not reimplemented; avatar
photo now carries a real `alt` (the person's name) rather than an empty
decorative alt, since the component is used in contexts (e.g. the top-bar
dropdown trigger) where no adjacent visible name text exists.

### Files created

`src/features/account/{types.ts, schemas.ts, index.ts}`,
`src/features/account/api/profileRepository.ts`,
`src/features/account/hooks/{useUserProfile.ts, useUpdateProfile.ts}`,
`src/features/account/components/{AccountHeader.tsx, EditProfileModal.tsx,
AccountSections.tsx}`, `src/app/routes/AccountPage.tsx`, plus matching test
files for each (`.test.ts`/`.test.tsx`) and `src/shared/ui/Avatar.test.tsx`.

### Files modified

`src/features/auth/types.ts` (extended `UserProfile`),
`src/features/auth/api/authClient.ts` (display-name sync fix, see above),
`functions/src/index.ts` (+ `functions/src/index.test.ts` unaffected —
`expect.objectContaining` still passes), `firestore.rules`,
`firestore-tests/users.rules.test.ts`, `src/shared/ui/Avatar.tsx` (added
`photoURL` support), `src/app/layouts/AppTopBar.tsx` (passes
`photoURL`/`displayName` to `Avatar`), `src/app/routes/router.tsx` (real
`AccountPage` replaces the Module 01 placeholder), `docs/DATABASE.md`,
`docs/SECURITY.md`. `src/app/routes/AccountPlaceholderPage.tsx` was deleted
(superseded).

### Known limitations

- No document created before this module's `onUserCreate` change is known
  to exist in any persisted environment (nothing has ever been deployed),
  so the stricter Module 03 update rule's backward-compatibility gap
  (documented in `docs/DATABASE.md`) is theoretical, not a live migration
  need.
- The `authClient.ts` display-name sync write is best-effort: in the rare
  case the trigger's own Firestore write genuinely hasn't completed yet
  when it runs, it fails silently (logged, not surfaced to the user) and
  the user would see their name missing until they set it via Edit
  Profile. Not reproduced in real-browser testing this session.
- One new lint warning (`react/set-state-in-effect` on
  `useUserProfile.ts`) — advisory only, same non-blocking tier as the
  project's 7 pre-existing warnings. The effect resets to a `loading` state
  before (re)subscribing, the same shape React's own data-fetching-effect
  documentation uses; not restructured further to avoid a materially more
  complex hook for a cosmetic lint preference.

### Deferred features (explicitly out of scope, not started)

Avatar upload (Storage), email change/reverification flow, seller
onboarding ("Become a seller"), and every marketplace/cart/orders/
seller-studio/admin surface reserved (but disabled) in the account sections
grid — all belong to later modules per the Module 03 scope rule.

### Technical debt

- Main bundle grew from ~927 kB to ~995 kB (gzip ~280 kB → ~300 kB) with the
  account feature added; `AccountPage` itself is correctly code-split
  (~11 kB own chunk) — the growth is the account feature's own code plus
  react-hook-form/zod usage already present from Module 01, not a
  regression in the existing code-splitting approach. Carries forward the
  existing Firebase-SDK-dominates-the-main-chunk debt noted in Module 02.
- No migration/backfill script exists for the theoretical pre-Module-03
  document shape gap noted above — not built since nothing to migrate
  exists yet; would be needed before any real deployment if legacy accounts
  ever existed.

## Pre-Module-04 validation & error-message hardening (COMPLETE)

**Status:** **COMPLETE — owner-approved and committed.** Picked up from a
prior session's uncommitted work-in-progress (recovered intact after an
unrelated Claude Code session restart — see recovery note below), inspected
first rather than restarted, then completed, tested, real-browser verified,
and owner-approved before commit.

### Scope

A production-quality validation and error-message system across every
currently implemented input form — Sign Up, Sign In, and Edit Profile —
so every validation failure names the specific field and the specific
problem, rather than a generic error. Firestore rules were **not** modified
(client-side limits were confirmed to already match `firestore.rules`
exactly); no Module 04 functionality was started.

### What was recovered vs. added this pass

Recovered and preserved: `src/shared/validation/fields.ts` (shared
`requiredTextField`/`emailField` builders), the Sign Up/Sign In schemas
(`src/features/auth/schemas.ts`), the profile-edit schema
(`src/features/account/schemas.ts`), the full Firebase Auth error-code map
(`src/features/auth/api/authErrors.ts`, including account-enumeration
protection and the emulator-vs-production network-error distinction), and
the three forms already wired to them.

Added/fixed this pass:
- **Real bug — whitespace-only phone number incorrectly rejected.** A
  `.trim().max().regex().optional().or(literal(''))` chain in
  `account/schemas.ts` evaluated the *untrimmed* input on its `literal('')`
  union branch, so a whitespace-only phone number failed both branches and
  was rejected as "Enter a valid phone number." instead of being accepted as
  empty. Rewritten as a `superRefine` that trims first and only validates
  shape once something is actually present. Regression-tested.
- **Real accessibility bug — error/hint text leaking into the accessible
  name.** All three forms implicitly wrapped `<label>` around both the input
  *and* its hint/error/count `<span>`, so a field's accessible name silently
  absorbed that text once an error appeared (e.g. "Display name" became
  "Display name Display name must be at least 2 characters."). This is a
  real WCAG concern (a screen reader re-announces a different, longer name
  after every validation failure) — not merely a testability inconvenience,
  though it also broke label-based test queries once tests actually
  exercised failed-then-shown-error states. Rebuilt every field in
  `SignInForm.tsx`, `SignUpForm.tsx`, and `EditProfileModal.tsx` onto
  explicit `htmlFor`/`id` label pairing so the accessible name stays the
  bare label text; hints/errors/counts continue to be conveyed only through
  `aria-describedby`, as originally intended.
- **Keyboard-submission gap — Edit Profile.** Its Save button lives in the
  modal's sticky footer, outside the `<form>` (so it stays visible while the
  form body scrolls) and is a `type="button"`. With no submit control inside
  the form, pressing Enter in a text field had nothing to trigger. Fixed
  with a visually-hidden, `tabIndex={-1}` native submit button inside the
  form — restores native Enter-to-submit without altering the visible
  layout or tab order.
- **Test-isolation bug — mocks not reset between tests.** `SignInForm.test.tsx`
  and `SignUpForm.test.tsx` never reset their `signInWithEmail`/
  `signUpWithEmail` mocks between tests, so call counts and call arguments
  leaked across tests once new tests actually invoked them successfully.
  Added `beforeEach` resets, matching the pattern already used in
  `EditProfileModal.test.tsx`.
- Added targeted test coverage for previously-untested but required
  scenarios: disabled-account and network/emulator-unreachable sign-in
  errors, malformed-email and short-name/short-password sign-up cases,
  focus-moves-to-first-invalid-field on every form, submit-button-disabled
  duplicate-submission prevention, and the two real bugs above.

### Validation rules (final)

- **Name (Sign Up / Edit Profile):** required (whitespace-only = required,
  not "too short"), trimmed, 2–60 chars, distinct required/too-short/
  too-long messages. No character-class restriction — apostrophes, hyphens,
  initials, and non-Latin names are legitimate.
- **Email:** required, trimmed, lowercased, format-checked.
- **Password (Sign Up):** required → ≥8 chars → uppercase → lowercase →
  digit, one message at a time. Sign In password is required-only (no
  complexity re-check — an existing, older password must still work).
- **Confirm password:** required, cross-field match against `password`.
- **Phone (Edit Profile, optional):** whitespace-only = empty/valid; once
  non-empty, ≤20 chars and shape-validated.
- **Bio (Edit Profile, optional):** whitespace-only = empty/valid; ≤280
  chars with a live count.

### Firebase/Firestore error mapping

`auth/email-already-in-use`, `auth/invalid-email`, `auth/weak-password`,
`auth/user-disabled`, `auth/operation-not-allowed`, `auth/too-many-requests`,
and `auth/network-request-failed` (emulator-aware vs. production-aware) each
map to a distinct, safe message. `auth/invalid-credential`/
`auth/user-not-found`/`auth/wrong-password` intentionally collapse to one
generic "Invalid email or password." — deliberate account-enumeration
protection, not a gap. Firestore write failures
(`profileRepository.ts`'s pre-existing, untouched `toAccountError`) map
`permission-denied` and `unavailable`/`deadline-exceeded` to safe messages.
No raw Firebase error code, stack trace, or emulator/internal detail ever
reaches the UI.

### Verification

- **Full test suite:** 161/161 passing (25 files). (One run needed
  `--no-file-parallelism` after stray leftover Node/Java processes from an
  earlier emulator/dev-server session — killed by PID before use — starved
  the worker-thread pool; every test that did start, in every attempt,
  passed with 0 real assertion failures.)
- **Firestore rules tests:** 21/21 passing (unaffected — rules unchanged;
  confirmed the client's `PHONE_MAX_LENGTH`/`BIO_MAX_LENGTH`/name bounds
  already match `firestore.rules`'s `isValidOptionalString`/
  `isValidDisplayName` exactly).
- **Typecheck / lint / build / `git diff --check`:** all clean (lint: same 8
  pre-existing advisory warnings, 0 new).
- **Real-browser verification** (Playwright Chromium against the live dev
  server, real SPA `<Link>` navigation, not only `page.goto`) at 1366×768,
  768×1024, 390×844, 320×568, and the 302×531 stress case: **90/90** Sign
  In/Sign Up checks (multiple simultaneous field errors, focus-on-error,
  `aria-describedby` wiring, Enter-key submission, zero horizontal overflow
  with 4 errors shown at once) and **65/65** Edit Profile checks, driven
  through a real sign-up → `/account` → Edit Profile flow (the Firestore
  profile document was seeded via the emulator's rules-bypass test API
  rather than waiting on `onUserCreate`, since this machine's
  already-documented flaky Functions-emulator cold start didn't fire that
  trigger during this run — the trigger itself was not touched): 3
  simultaneous field errors, sticky-footer Save always reachable and within
  viewport, no overflow, per-field error clearing, whitespace-only
  optional-field acceptance, Enter-key submission. 0 genuine console errors
  across both passes (the one captured error is the pre-existing, documented
  best-effort display-name-sync failure caused by the Functions-emulator gap
  above, not a regression).

### Recovery note

This pass began after an unrelated VS Code/Claude Code restart invalidated
the prior session mid-work. The interrupted session's uncommitted changes
were confirmed intact on disk, inspected file-by-file before any new edit,
and preserved as the foundation rather than discarded or redone.

### Files changed

`src/shared/validation/fields.test.ts`, `src/features/auth/schemas.ts` (+
`.test.ts`), `src/features/account/schemas.ts` (+ `.test.ts`),
`src/features/auth/components/SignInForm.tsx` (+ `.test.tsx`),
`src/features/auth/components/SignUpForm.tsx` (+ `.test.tsx`),
`src/features/account/components/EditProfileModal.tsx` (+ `.test.tsx`).
`firestore.rules` and all Module 03 profile/repository/hook logic were left
untouched.

### Known limitations

- No character-class restriction on Name fields — a deliberate, documented
  choice, not an oversight (see Validation rules above).
- The real-browser Edit Profile pass worked around this machine's
  already-documented Functions-emulator cold-start flakiness by seeding the
  Firestore document directly rather than waiting on the real
  `onUserCreate` trigger; the trigger's own behavior was not verified again
  in this pass (it was already verified in Module 03).

## Completed modules

- **Module 00 — Foundation:** feature-first folder structure, routing
  shell, Tailwind design foundation, environment schema, Firebase client
  skeleton (emulator-only), deny-by-default Firestore/Storage rules,
  testing baseline, CI baseline, architecture documentation. Review result:
  **PASS WITH NOTES**. Checkpoint commit: `f872258`.
- **Module 01 — Authentication:** Firebase email/password sign-up/sign-in/
  sign-out, persistent session with explicit `browserLocalPersistence`,
  loading/restoration state, backend-authoritative role assignment via a
  Cloud Function (`functions/src/index.ts`), the first real `users/{uid}`
  Firestore rule, an auth-guard foundation (`RequireAuth`), and a
  standalone ADMIN/SUPER_ADMIN bootstrap script. Independently reviewed,
  verified live against the Firebase emulators, and real-browser tested
  (Playwright) — one genuine bug found and fixed during browser testing
  (see Technical debt history). Review result: **PASS**. Checkpoint
  commit: this module's own commit (see `git log`).
- **Module 02 — Design System & Navigation:** shared UI primitive library
  (`src/shared/ui`), branding component, app shell (top bar, bottom nav,
  sidebar, nav drawer) with mobile bounded-scroll / desktop full-page
  layout, route-level scroll-reset on client-side navigation, and
  presentation-only updates to the Module 01 auth pages. Three owner
  correction rounds (presentation polish, mobile collision/layout,
  small-viewport scroll-reset), each independently re-verified. Review
  result: **PASS — owner approved**. Checkpoint commit: `77cee05`.
- **Module 03 — Customer Account & Profile Foundation:** real customer
  account dashboard, profile repository/hooks with realtime updates, Edit
  Profile (display name, phone, bio editable; email and role read-only),
  avatar initials/photo fallback, deterministic profile-completion
  metadata, field-level Firestore security rules with 21/21 emulator-
  verified tests, and full authentication regression. Four owner review
  rounds (initial implementation, Edit Profile responsive sizing, the
  sign-up "Network error" root cause, Windows Java 21/emulator-persistence
  reliability), each investigated to a real root cause and fixed. Review
  result: **PASS — owner approved**. Checkpoint commit: this module's own
  commit (see `git log`).
- **Pre-Module-04 validation & error-message hardening:** production-quality,
  field-specific validation and safe Firebase/Firestore error mapping across
  Sign Up, Sign In, and Edit Profile; two real bugs found and fixed
  (whitespace-only phone number incorrectly rejected; error/hint text
  leaking into form fields' accessible names); Enter-key submission fixed
  for Edit Profile; 161/161 unit/component tests, 21/21 Firestore rules
  tests, and 155/155 real-browser checks across five viewports (1366×768
  through the 302×531 stress case). Review result: **PASS — owner
  approved**. Checkpoint commit: this pass's own commit (see `git log`).
- **Module 04 — Seller Foundation & Artwork Draft Management:** real seller
  application flow (`sellers/{uid}`), backend-authoritative promotion via
  `functions/src/promoteSeller.ts` (operator script, mirrors
  `setAdminClaim.ts`, never a deployed/callable endpoint), a `RequireRole`
  Seller Studio guard, and DRAFT/SUBMITTED-only artwork draft CRUD
  (`artworks/{artworkId}`) with integer-minor-unit pricing and a fully
  server-enforced ownership/lifecycle/image-lock model. Owner manual
  acceptance testing after the initial commit surfaced two real, pre-
  existing (Module 01) bugs in the sign-up/profile-provisioning path — a
  display-name write race against the `onUserCreate` trigger, and no safe
  recovery for an account the trigger genuinely failed to provision — both
  root-caused and fixed, with a new trusted `repair-missing-profile`
  operator script for the latter (see the module write-up above for full
  detail). 297/297 unit/component tests, 64/64 Firestore rules tests (21
  pre-existing + 43 new), 9/9 Cloud Functions tests, and real-browser/
  emulator verification at every stage including a final from-scratch
  fresh-account run. One real pre-existing bug found and fixed along the
  way during initial implementation (`Toast` never auto-dismissed). The
  owner then personally completed the full manual acceptance walkthrough in
  a real browser end to end. Review result: **PASS — owner manually
  accepted**. Checkpoint commits: `d483994`, `1f8ca5a`, and this closeout's
  own commit (see `git log`).
- **Module 04 — Emulator Persistence & Seller-Authorization Reconciliation:**
  hardening pass fixing the Vite-file-watcher-lock root cause of SELLER
  authorization reverting to CUSTOMER after a restart, a PID-stamped
  single-instance emulator guard, a safe snapshot/export/rollback
  architecture, a trusted `reconcile-roles` operator script, and a
  read-only `verify:emulator-state` diagnostic. Verified against the real
  owner account across three full restart cycles, one real promotion, and a
  post-promotion restart, then personally confirmed by the owner via a real
  Windows Ctrl+C shutdown/restart (authentication, SELLER authorization,
  Seller Studio access, DRAFT artwork persistence, and emulator
  import/export all held). Review result: **PASS — owner restart-verified**.
  Checkpoint commit: `877f3ba`.
- **Module 05 — Artwork Media/Image Upload & Emulator Lifecycle Hardening:**
  Storage-backed artwork photo upload for Seller Studio DRAFT artworks
  (add/preview/reorder/remove, progress/retry/cancel), owner-scoped
  `storage.rules` opened for the first time, Firestore `images` metadata
  validation, and submitted-artwork media lock — plus the emulator launcher
  fixes it surfaced: identity-verified stale-lock recovery (closing a
  PID-reuse gap), tree-aware orphan-process cleanup extended to cover the
  Functions Emulator's own dynamic-port worker (previously invisible to a
  port-only check), and an independent port-readiness gate before startup
  is ever reported ready. Verified against the real owner account: real
  photos uploaded through the real browser, persisted through a full
  restart with byte-identical Storage objects and Firestore metadata;
  SELLER/APPROVED authorization held throughout; the fixed launcher
  correctly recovered from two independently-reproduced real broken states
  with zero unidentified processes and zero manual intervention. Review
  result: **PASS — owner manually accepted**. Checkpoint commit: this
  closeout's own commit (see `git log`).

## Pending modules (not started, order not yet committed)

Artist Profiles, Marketplace/Search, Wishlist/Likes/Follows/Sharing, Cart,
Checkout/Payments, Orders, Reviews, Notifications, AI (analysis / assistant
/ search / recommendations), Auctions, AR Engine, Admin Control Center
(including seller-application review UI), Audit Logs, Analytics, hardened
Security Rules, Production Deployment. (Customer Account & Profile
Foundation is Module 03, complete and committed; Seller Foundation &
Artwork Draft Management is Module 04, complete and committed; Artwork
Media/Image Upload is Module 05, complete and committed — see above. A
dedicated Inventory feature beyond the single `inventoryCount` field
remains deferred, not started. Avatar *upload* specifically also remains
deferred to a future module.)

## Architecture decisions made so far

- Feature-first `src/` layout (see `docs/ARCHITECTURE.md`).
- TanStack Query for one-shot/backend requests; realtime Firestore
  subscriptions are owned by dedicated repository/hook pairs, never
  wrapped in TanStack Query, to avoid duplicate cache ownership.
- Zustand for local/UI state; React Context reserved for narrow,
  slowly-changing app-level concerns only — the Module 01 `AuthProvider`
  is exactly this: the current auth-session shape, via Context.
- Tailwind CSS chosen over a full component library to keep dev-server
  memory/bundle size low on the target 8GB development laptop.
- Firebase project id `demo-artvault` — a `demo-`-prefixed id, which the
  Local Emulator Suite treats as fully offline and requiring no real
  Firebase project. Local dev needs no Firebase account at all.
- Role-based access uses Firebase Auth **custom claims**
  (`CUSTOMER | SELLER | ADMIN | SUPER_ADMIN`) as the sole security
  authority, assigned only by `functions/src/index.ts`'s `onUserCreate`
  trigger; a mirrored Firestore field is for convenience reads only and is
  never trusted by a rule or function. `ADMIN`/`SUPER_ADMIN` have no
  self-service or in-app path — only `functions/src/setAdminClaim.ts`, a
  local operator script, can grant them.
- **Cloud Functions runtime: Node 22** (decided in Module 01 — see
  `docs/ARCHITECTURE.md`).
- `functions/` is a separate Node/TypeScript project (own `package.json`,
  `node_modules`, `tsconfig.json`) outside the root npm scripts —
  `npm --prefix functions run typecheck|test|build`.
- `functions/` compiles to **CommonJS, not ESM** — discovered during live
  emulator verification that the Functions emulator's local discovery step
  hangs indefinitely against an ESM build ("Cannot determine backend
  specification"); CommonJS is also what Firebase's own official function
  templates default to, for the same reason.
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

- Payment provider and its fee structure — chosen in the payment module.
- AI provider behind the `AIProvider` interface — chosen in the AI module.
- Structured/full-text search provider beyond Firestore-native filtering.
- Enabling the Firebase Blaze billing plan, or any paid third-party service.

## Database version

`users/{uid}` is implemented (Module 01, extended in Module 03). Every other
collection remains a draft — not created in a live project. See
`docs/DATABASE.md`.

## Firestore collections

- **Implemented:** `users/{uid}` (Module 01, extended in Module 03 with
  `photoURL`/`phoneNumber`/`bio`/`profileCompleted` and a field-level update
  rule) — see `docs/DATABASE.md` for its schema and rule.
- **Draft (not yet created):** `sellers`, `artists`, `artworks`,
  `carts/{uid}/items`, `orders`, `orders/{orderId}/items`,
  `wishlists/{uid}/items`, `likes/{artworkId}/by`, `follows`
  (bidirectional), `reviews`, `notifications`, `auctions`,
  `auctions/{auctionId}/bids`, `auditLogs`.

## Indexes

None defined yet (`firestore.indexes.json` is an empty skeleton — the
Module 01 `users/{uid}` rule needs no composite index).

## Cloud Functions

- `onUserCreate` (`functions/src/index.ts`) — Auth `onCreate` trigger.
  Sets the `role: CUSTOMER` custom claim and creates the matching
  `users/{uid}` profile document. Runtime: Node 22.
- `setAdminClaim` (`functions/src/setAdminClaim.ts`) — NOT a deployed
  function; a local operator script for granting `ADMIN`/`SUPER_ADMIN`.

## AI providers

None selected. `AIProvider` interface defined in `docs/AI_ARCHITECTURE.md`
only.

## AR implementation

None implemented. `<model-viewer>` is the design candidate; asset pipeline
designed but not built. See `docs/AR_ARCHITECTURE.md`.

## External services

None enabled. No Firebase billing plan (Blaze) enabled. No payment,
search, or AI provider account created. Cloud Functions and Firestore
rules for Module 01 run only against the Local Emulator Suite.

## Environment variables

Names only (see `.env.example` — all values there are non-secret demo
placeholders for the emulator); unchanged since Module 00:

`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`,
`VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`,
`VITE_USE_FIREBASE_EMULATORS`.

## Known bugs

None in code that ran. See "Security issues" below for a genuine
environment limitation (not a code bug) affecting what could be verified
this module.

## Security issues

None open in ArtVault's own code. One item:

- **CSP "blocks eval" warning** (carried over from Module 00): confirmed
  not caused by ArtVault — see previous entry, unchanged, still tracked in
  `docs/SECURITY.md`.

**Resolved:** the earlier "local emulator verification blocked by missing
Java" item is closed. A working Eclipse Adoptium JDK 21 was found already
installed on this machine (`java` on PATH resolved to an unrelated old
Java 8 install first — see `docs/DEPLOYMENT.md` for the exact PATH fix).
With that JDK, the Auth/Firestore/Functions emulators were started for
real and every previously-unverified check now has a real result — see
"Live emulator verification" below.

## Live emulator verification (Module 01)

Ran for real against the Firebase Local Emulator Suite (Auth, Firestore,
Functions — `--only auth,firestore,functions`), not mocked:

- **Fixed a genuine blocker found in the process:** the Functions emulator
  hung ("Cannot determine backend specification") trying to load
  `functions/`'s ESM build. Switched `functions/` to compile as CommonJS
  (dropped `"type": "module"`, `module: commonjs` in `tsconfig.json`) —
  matches Firebase's own official function templates, which default to
  CommonJS for exactly this reason. After the fix, the emulator logged
  `Loaded functions definitions from source: onUserCreate` and the trigger
  initialized correctly.
- **Firestore rules tests** (`npm run test:rules`): **6/6 passing** for
  real against the live emulator (owner can read own profile; cannot read
  another user's; cannot create a profile document directly; cannot
  escalate their own role; can update their own `displayName`; an
  unauthenticated read is blocked).
- **Live sign-up → onUserCreate → claim → Firestore doc**, driven through
  the real client SDK against the real emulators: sign-up created a real
  Auth account; the `role: CUSTOMER` claim appeared on the ID token
  (proving the trigger ran); the `users/{uid}` document was created with
  the expected fields and real server timestamps (verified independently
  via the Admin SDK, bypassing rules, as ground truth).
- **Sign-in/out:** correct-credential sign-in succeeded; wrong-password
  sign-in was rejected with `auth/wrong-password`; the signed-in user
  could read their own profile document.
- **Security negative tests, all blocked as expected** (verified by the
  real `PERMISSION_DENIED` rejection from the live rules engine, not
  assumed): CUSTOMER → ADMIN escalation, CUSTOMER → SUPER_ADMIN
  escalation, changing `uid`, changing `email`, changing `createdAt`,
  creating a `users/{uid}` document directly, deleting a `users/{uid}`
  document, reading an unrelated collection (`artworks`) — every one
  rejected with the exact rule line the rejection came from. A legitimate
  `displayName` update by the owner succeeded, as it should.
- **Privileged path still works:** the Admin SDK call `setAdminClaim.ts`
  uses (`getAuth().setCustomUserClaims(uid, { role })`) was exercised for
  real against the same live account and correctly granted `ADMIN`.
- **Not covered by this pass (needs a real browser, not just emulators):**
  the actual browser-refresh "no false logout" behavior and direct-URL
  navigation are verified today only at the unit/component level
  (`AuthProvider.test.tsx`, `RequireAuth.test.tsx`, `SignInPage.test.ts`);
  a real browser session against the running emulators is the next,
  separate verification step.

## Real-browser verification (Module 01)

Driven with Playwright Chromium (a genuine browser engine — real DOM,
real network, real console; the `claude-in-chrome` extension tools were
unavailable in this session, so Playwright was used as the real-browser
tool instead) against the actual Vite dev server + live Firebase
emulators, not mocks:

- Sign-up → lands on `/account`, correct email shown. Role claim was
  initially "pending" due to this machine's slow local Functions
  cold-start (see Technical debt) — a real, root-cause bug was found and
  fixed here (see above): the app now correctly self-heals to the right
  role via refresh once the claim is available, verified by waiting for
  the (slow, local-only) trigger to actually finish and confirming the UI
  recovers correctly, rather than assuming it would.
- Refresh persistence: no false "signed out" flash (polled the header at
  ~50ms resolution through the reload), session and role both restored
  correctly.
- Direct URL navigation to `/account` works while authenticated; redirects
  to `/sign-in` while signed out.
- Sign-out clears auth state and blocks `/account` again.
- Redirect-back: signing in from a `/sign-in` redirect returns to
  `/account`, not the homepage.
- Second refresh: session and role both still correct.
- Responsive check at 375×667, 390×844, 412×915, 768×1024, and 1366×768:
  no horizontal overflow, no clipped/overlapping fields, all inputs and
  the submit button within viewport bounds, and `autocomplete` attributes
  (`email`, `new-password`) genuinely present at runtime — all real
  browser measurements, not assumptions from reading the markup.
- Console: 0 genuine errors/pageerrors across the whole flow; only benign
  Vite HMR and React DevTools informational messages.
- **Result: 32/33 checks passed** — the one "failure" is the
  environment-timing-only immediate-role check discussed above, which is
  expected on this machine and not a product defect.

## Independent review (Module 01)

A strict code-level review (reading every changed/created file directly,
not trusting the implementation report) found and fixed, in scope:

- **Race condition in `AuthProvider`:** rapid auth-state changes could let
  a stale, slower role-claim lookup overwrite a newer one; also no guard
  against a lookup resolving after unmount. Fixed with a token/cancellation
  counter; locked in with a dedicated test.
- **`ensurePersistence` permanent-poisoning bug:** a single `setPersistence`
  failure would have cached the rejection forever, breaking all future
  sign-in/up attempts for the rest of the page's life. Fixed to reset and
  retry on failure instead.
- **Header flashed the signed-out nav during session restoration:**
  `RootLayout` treated any non-`'authenticated'` status as signed-out,
  briefly showing "Sign in/Sign up" even while a real session was still
  loading. Fixed to render neither nav state while `status === 'loading'`.
- **Dead redirect-back state:** `RequireAuth` captured `{ from: location }`
  on redirect to `/sign-in` but nothing ever read it — post-sign-in always
  hard-coded to `/account` regardless of the originally-requested page.
  Fixed: `RequireAuth` now passes the plain pathname, and `SignInPage`
  navigates back to it (falling back to `/account`); covered by a new test.
- **Form accessibility:** per-field errors weren't programmatically
  associated with their inputs. Added `aria-invalid`/`aria-describedby` on
  every field in both forms, plus `autoComplete` (`email`,
  `current-password`, `new-password`, `name`) for password-manager and
  mobile-keyboard support.

All fixes re-verified: typecheck, lint, full test suite, and build all
re-ran clean after these changes (see Tests/Build below).

## Tests

- **Root (`npm run test -- --run`):** 24 files, 90 tests, all passing (up
  from 16/42 — Module 03 added `schemas.test.ts`, `profileRepository.test.ts`,
  `useUserProfile.test.tsx`, `AccountHeader.test.tsx`,
  `EditProfileModal.test.tsx`, `AccountSections.test.tsx`,
  `AccountPage.test.tsx`, and `Avatar.test.tsx`).
  Covers (Module 03 additions): profile update-schema validation
  (trimming, length caps, loose international phone format), the profile
  repository's defensive read-side mapping (missing optional fields on a
  pre-Module-03 document, an unrecognized role, error-code mapping) and its
  write-side allow-list + deterministic `profileCompleted`, the
  `useUserProfile` realtime-subscription lifecycle (no subscription while
  loading/signed-out, exactly one subscription per uid, cleanup on unmount
  and on uid change), Edit Profile's dirty-state gating/validation/save
  success/save failure (values preserved, not cleared)/unsaved-changes
  confirm-on-close, `AccountHeader`'s role/completion badges, every future
  account section rendering as a genuinely disabled control, and
  `AccountPage`'s four `ProfileState` branches (loading/error/missing/
  loaded). Everything from Module 01/02 (env, router/layout, `AuthProvider`,
  `RequireAuth`, auth schemas/forms, `useNavItems`, `Modal`, `Drawer`,
  `AIAssistantLauncher`, `ViewInArBadge`) still passes unmodified.
- **`functions/` (`npm --prefix functions run test`):** 1 file, 2 tests,
  passing (unmodified — `expect.objectContaining` still matches after
  Module 03 added fields to the created document). Covers
  `handleUserCreate` setting the claim/creating the profile doc, and
  normalizing missing email/displayName to `null` rather than `undefined`
  (Firestore rejects `undefined` field values).
- **`firestore-tests/users.rules.test.ts` (`npm run test:rules`): 21/21
  passing** (up from 6/6 — Module 03 rewrote the update rule into a
  field-level allow-list and added coverage for every required security
  scenario), **verified against a real live Firestore emulator**, twice, on
  separate emulator instances. Kept in its own `vitest.rules.config.ts` and
  out of the main `npm run test` run so a missing emulator never fails the
  default test command in an environment without Java configured.

## Deployment

Not deployed to any real environment (unchanged — still ₹0, still no
Blaze). The Local Emulator Suite itself **was** exercised for real this
module — see "Live emulator verification" above.

## Costs

₹0. No billing plan enabled, no paid resource created.

## Technical debt

- **Route-level code-splitting is implemented (Module 02)** — sign-in/up/
  account are genuinely separate chunks now — **but it did not shrink the
  main bundle** (~925 kB, up slightly from ~907 kB). The dominant cost is
  the Firebase SDK, loaded eagerly at startup because `AuthProvider` needs
  `onAuthStateChanged` immediately on every route, plus the shell/nav/UI
  code that now renders on every page. Splitting further would mean
  deferring Firebase itself, which isn't reasonable while auth state gates
  the whole shell. Revisit only if a real profiling need arises later.
- `Dropdown`/`DropdownItem` implement outside-click and Escape-to-close
  but not full ARIA menu roving-focus (arrow-key navigation between
  items) — reasonable for today's 2-item profile menu; worth revisiting
  if a dropdown ever grows to many items.
- Color-token contrast was reasoned about at definition time (light text
  on dark surfaces, dark text on light input surfaces) but not verified
  with an automated contrast-checking tool — no such tool was available
  in this environment. Worth a real contrast audit before production.
- The sidebar/bottom-nav/drawer currently show only Home (+ Account when
  signed in) — correct and expected per the "no fake nav" rule, not a
  bug, but it will look sparse until Marketplace/Auction/etc. modules
  ship and flip their nav items to `available`.
- Running `npm run test`/`build` inside this machine's sandboxed shell
  fails to spawn worker threads (Vitest) — passes normally outside the
  sandbox restriction; CI is unaffected. Carried over from Module 00.
- No top-level React error boundary yet. Carried over from Module 00.
- **`java` on PATH resolves to an unrelated old Java 8 install; the
  working JDK 21 needed for the emulators is present but not first on
  PATH.** Worked around per-command this session (see `docs/DEPLOYMENT.md`
  for the exact `export PATH=...` line); a one-time permanent fix (reorder
  the user PATH) is recommended so future sessions/terminals don't need
  the workaround. No admin rights required for that fix.
- **`functions/` has 7 moderate-severity `npm audit` findings** — all one
  transitive `uuid` advisory (buffer-bounds check) pulled in through
  `gaxios`/`teeny-request`/`@google-cloud/storage` by `firebase-admin`.
  `npm audit fix --force` would downgrade `firebase-admin` to `10.3.0` (a
  major breaking regression) — not applied. No non-breaking fix is
  currently published upstream; revisit when `firebase-admin` or its
  dependencies update their `uuid` pin.
- **Minor UX edge case:** if `refreshRole()` fails right after a
  successful sign-up (e.g. a transient network error during the forced
  token refresh), `SignUpForm` surfaces a generic error message even
  though the account was already created — the user would need to sign in
  normally on retry. Rare, not a security issue, not fixed now to avoid
  adding complexity for an edge case; worth revisiting if it's ever
  observed in practice.
- `functions/` is not wired into `.github/workflows/ci.yml` yet (root CI
  only covers the frontend). Recommended follow-up, not done silently in
  this module since it's a separate piece of CI infrastructure with its
  own risk (emulator timing, port availability) deserving its own review.
- **`onUserCreate` sets the custom claim and writes the Firestore profile
  as two independent Admin SDK calls, not one atomic operation.** If the
  Firestore write fails after the claim succeeds (or vice versa), the user
  ends up with a mismatched state (e.g. a role claim but no profile
  document), and Auth triggers don't retry by default. Nothing in Module
  01 currently reads the Firestore profile doc (only the token claim), so
  this has no visible effect yet — flagged now because a later module
  (Customer Account) reading that document will need to handle a missing
  doc defensively, or this needs a reconciliation step, before then.
- **Corrected during real-browser verification:** the "self-corrects on
  manual refresh" claim above was actually false as originally implemented
  — `AuthProvider` only read the role claim once (unforced) per auth-state
  change, so a session restored from a cached pre-claim token stayed stuck
  showing "role pending" on every subsequent refresh, not just the first.
  Fixed at the root: `AuthProvider` now uses the same retry-with-forced-
  refresh logic (`waitForRoleClaim`) on every auth-state change, not only
  right after sign-up — verified in a real browser that this now
  genuinely self-heals via refresh. `waitForRoleClaim`'s default budget
  was also raised (~2s → ~6s) after real-browser testing showed the
  original budget was too tight even for a healthy cold start. Separately
  confirmed (ground-truth Admin SDK inspection) that the claim and
  Firestore doc are always set correctly server-side regardless of
  client-side timing — this was purely a client read-side gap, not a
  trigger correctness issue.
- **This machine's Functions emulator cold start is very slow (14-40s
  observed)** — worker process spin-up plus Admin SDK credential
  auto-detection retries (visible as recurring `MetadataLookupWarning`
  noise), compounded by running Chrome + Vite + the JVM-based Firestore
  emulator simultaneously on 8GB RAM. This is an environment/tooling
  characteristic, not an ArtVault code issue, and real deployed Cloud
  Functions cold-start far faster. Client-side polling was deliberately
  *not* stretched to cover the full local delay — that would hurt real
  production UX for no real benefit; the fix above ensures the app
  recovers correctly regardless of how long the trigger actually takes.

## Next action

Module 03 (Customer Account & Profile Foundation) is complete, owner-
approved, and committed. Not pushed (no remote configured), no new branch
created. Module 04 has not been started — next module selection is an
owner decision. Owner still needs to supply the real ArtVault logo asset to
the repository when convenient (not a blocker — a documented temporary
placeholder covers development meanwhile; see `public/brand/README.md`).
