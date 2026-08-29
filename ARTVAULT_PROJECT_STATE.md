# ArtVault — Project State

_Last updated: 2026-08-29 — Module 01 complete: implemented, independently
reviewed, verified live against the Firebase Local Emulator Suite, and
real-browser tested. Approved by the owner; committed as the Module 01
checkpoint (see this file's own git history for the commit hash)._

## Project version

`0.0.0` (unreleased, foundation stage — no deployed environment exists yet).

## Current module

None in progress — Module 01 complete. Awaiting Module 02 scope selection.

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

## Pending modules (not started, order not yet committed)

Customer Account, Seller Studio, Artwork Management, Artist Profiles,
Marketplace/Search, Wishlist/Likes/Follows/Sharing, Cart,
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

`users/{uid}` is implemented (Module 01). Every other collection remains a
draft — not created in a live project. See `docs/DATABASE.md`.

## Firestore collections

- **Implemented:** `users/{uid}` (Module 01) — see `docs/DATABASE.md` for
  its schema and rule.
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

- **Root (`npm run test -- --run`):** 11 files, 31 tests, all passing.
  Covers: env defaults + failure path, router/layout composition, the
  `AuthProvider` loading→authenticated/unauthenticated state machine
  (including the stale-lookup race-condition fix above), the
  `RequireAuth` guard's three render states, `signUpSchema`/`signInSchema`
  validation, `toAuthErrorMessage` code mapping, the `waitForRoleClaim`
  retry/give-up logic, `SignInForm`/`SignUpForm` validation + success +
  failure paths, and the redirect-back path parsing (all with the Firebase
  SDK mocked — no live emulator needed).
- **`functions/` (`npm --prefix functions run test`):** 1 file, 2 tests,
  passing. Covers `handleUserCreate` setting the claim/creating the
  profile doc, and normalizing missing email/displayName to `null` rather
  than `undefined` (Firestore rejects `undefined` field values).
- **`firestore-tests/users.rules.test.ts` (`npm run test:rules`): 6/6
  passing, verified against a real live Firestore emulator** (see "Live
  emulator verification" above). Kept in its own `vitest.rules.config.ts`
  and out of the main `npm run test` run so a missing emulator never fails
  the default test command in an environment without Java configured.

## Deployment

Not deployed to any real environment (unchanged — still ₹0, still no
Blaze). The Local Emulator Suite itself **was** exercised for real this
module — see "Live emulator verification" above.

## Costs

₹0. No billing plan enabled, no paid resource created.

## Technical debt

- The production build emits a single ~907 kB JS chunk (grew slightly
  from Module 00's ~856 kB with the new auth forms). Same reasoning as
  Module 00: expected to resolve via route-level code-splitting once more
  real routes exist, not addressed now.
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

Module 01 is approved and committed. Propose and get sign-off on Module 02
scope next — candidates: Customer Account or Artwork Management,
depending on the owner's priority.
