# ArtVault — Project State

_Last updated: 2026-09-15 — UI-04 (Auctions Experience) is **COMPLETE,
OWNER APPROVED, and COMMITTED**. A full read-only Auctions UI/UX
foundation: landing page (`/auctions`) with Upcoming/Live/Past tabs, and a
single detail page (`/auctions/:auctionId`) that renders three genuinely
different compositions — upcoming, live, and a dedicated completed-auction
result page — driven entirely by real `auctions` Firestore documents and
each auction's real, trusted `startAt`/`endAt` timestamps. No trusted
bid-placement, bid-history, or auction-finalization backend exists yet
(see docs/AUCTION_ARCHITECTURE.md) — bidding, live bidding/bid history,
and top bidders all render real, honestly-disabled/not-connected controls
rather than any fabricated data; winner/final-bid rendering only ever
appears from real `winnerUid`/`winningBidAmount` fields. Frontend:
**1103/1113 passing** (1113 total; the 10 non-passing are all in
`router.test.tsx`, the same pre-existing, machine-specific
resource-contention artifact documented at every prior UI closeout on this
machine — re-confirmed passing 15/15 in isolation the same day, not a
regression; up from 1033/1035 at UI-03's close, +78 new/changed auction
tests). Firestore rules: **307/307** across 10 files (up from 292/292 at
UI-03's close — one new file, `auctions.rules.test.ts`). `tsc -b` clean,
`oxlint` clean (0 errors, pre-existing warnings only in unrelated files),
production build clean. See "UI-04 — Auctions Experience" below for the
full write-up. Next UI: **UI-05** (not started).

_Previously: UI-03 (Seller Studio, Artwork Management & Admin Moderation
Override) is **COMPLETE and OWNER APPROVED**, committed in its own
closeout commit. Owner manually retested and confirmed: ADMIN suspension
works end-to-end, a suspended artwork disappears from `/explore`
immediately, the seller sees the suspension reason, the seller retains
Edit + Delete on a SUSPENDED artwork, REJECTED/PUBLISHED/SUSPENDED seller
controls all behave as required, and SUBMITTED remains locked/read-only.
Frontend: **1033/1035 passing**. Firestore rules: **292/292** across 9
files. Storage rules: **22/22**. Functions: **179/179**. `tsc -b`/`tsc
--noEmit` clean, `oxlint` clean, production build clean. See "UI-03 —
Seller Studio, Artwork Management & Admin Moderation Override" below for
the full write-up._

_Before that: UI-02 (Cart, Checkout, Orders & Account Experience) is
**COMPLETE and OWNER APPROVED**, committed in its own closeout commit.
Frontend: **939/939** (up from 793/793 at UI-01's close). Firestore rules:
**268/268** across 8 files. `tsc -b` clean, `oxlint` clean (0 errors,
pre-existing warnings only in unrelated files), production build clean.
See "UI-02 — Cart, Checkout, Orders & Account Experience" below for the
full write-up._

_Earlier still: UI-01 (Complete Responsive Marketplace UI) is **COMPLETE and
OWNER APPROVED**, committed together with Module 13 (Admin
Control Center, Phases 1-4 — see its own write-up below, already fully
implemented and tested as of the previous update but not yet committed
until now). Frontend: **793/793** (up from 689/689 at Module 13 Phase 4).
`tsc -b` clean, `oxlint` clean (0 errors, pre-existing warnings only in
unrelated files), production build clean. See "UI-01 — Complete Responsive
Marketplace UI" below for the full write-up. The two paragraphs
immediately below this one, describing Module 13 Phases 1-2, are
historical context from an earlier point in that module's own development
and are superseded by "Module 13 — Admin Control Center" further down,
which documents Phases 1-4 as complete. Module 13 gives ArtVault its first
deployed, HTTP-reachable
Cloud Functions — `approveSellerApplication`, `rejectSellerApplication`,
`moderateArtwork` — every other function in `functions/src/` remains a
local, human-run, Admin-SDK-only operator script. A single centralized
`requireAdminCaller` authorization boundary reads only the Firebase
Auth-verified `request.auth.token.role` claim (never `request.data`, never
any Firestore-mirrored field) and admits only `ADMIN`/`SUPER_ADMIN`. Seller
rejection is a real, owner-approved schema decision ("Option A"): a
`REJECTED` application is a third, terminal, persistently-stored outcome
alongside `PENDING`/`APPROVED` (never deleted, never silently reversible,
no reapplication path), carrying a real `rejectionReason` the applicant can
see on their own account. `firestore.rules` was **not** touched — every
Module 13 write goes through the trusted Admin SDK, which always bypasses
client rules, and Option A required no new client-reachable write path
(`sellers/{uid}`'s pre-existing `allow update: if false` already makes a
REJECTED application exactly as immutable to its own applicant as an
APPROVED one). Phase 2 added: server-boundary input validation (document-id
shape/length/forbidden-character checks, bounded control-character-free
text for `rejectionReason`), an error-leakage boundary (`toCallableError`
only ever echoes a closed allowlist of known domain-invariant messages;
anything else is logged server-side and replaced with a generic message),
transactional concurrency safety in the underlying
`promoteSellerByUid`/`rejectSellerApplicationByUid`/
`decideArtworkByArtworkId` business logic (each now a `db.runTransaction()`
read-check-write), and a full adversarial authorization/validation/
idempotency test matrix across all three callables — including real,
deterministically-gated near-simultaneous-caller tests proving Firestore's
transactional guarantee actually holds at this layer (exactly one of two
racing decisions ever commits; the loser is correctly told the outcome was
already decided; no duplicate claim/profile/write is ever produced). App
Check enforcement and distributed rate limiting were both deliberately
**not** implemented this phase — the former because production App Check
registration doesn't exist yet and enabling it now would only block local
emulator development, the latter because an in-memory/per-instance limiter
would be genuinely unreliable across Cloud Functions' auto-scaled
instances, not real protection — both are reviewed, found not to block a
future correct implementation, and recorded below as explicit, tracked
pre-production-deployment requirements rather than silently deferred. See
"Module 13 — Admin Control Center" below for the full write-up. Module 12
(Artwork Likes) — a real, sign-in-
required "like" on the Artwork Detail Page, deliberately not another
Wishlist heart: a public, aggregate signal (Wishlist stays a private saved
list). Denormalized `artworks/{artworkId}.likeCount` plus a private
`likes/{artworkId}/by/{uid}` document, with `firestore.rules` proving —
never merely assuming — that the two can only ever change together, in
both directions, via mutual `exists()`/`existsAfter()`/`get()`/`getAfter()`
checks (Option D of a deliberately re-researched, owner-hardened
architecture that explicitly rejected accepting any counter drift and
rejected `count()` aggregation for the same liker-identity-privacy reason
this codebase already established for auction bidders). Pre-existing
artworks were backfilled to `likeCount: 0` via a trusted, dry-run-by-default
Admin-SDK operator script, never a manual Console edit. The client never
reads-then-writes a count — every Like/Unlike is one atomic
`writeBatch()`. Optimistic UI with a real hardening pass: a rejected batch
is treated as ambiguous, not an automatic failure — the client re-reads
authoritative Firestore state and only reconciles to it when that read
*proves* the desired end state actually happened (discovered necessary
after real concurrent-write testing exposed a narrow Firestore-emulator
write-stream artifact where a write can commit server-side while its own
client promise is still rejected; every security/data invariant held in
every trial regardless). A genuine authorization failure is never
converted into a false success. No card-level Likes, no public liker
list, no Follows, no notifications, no cross-tab locking (reconciliation
already covers it more broadly). Verified via the real `firebase/auth` +
`firebase/firestore` **client SDK** against the real Auth/Firestore
emulator — not genuine browser DOM/E2E automation, which this environment
cannot perform; that remains a documented future verification item, not a
claimed one. **Implementation (4 phases: migration tooling, security
rules, client feature, concurrency hardening), automated tests, full
regression, typecheck, lint, and production build all complete, owner-
reviewed and approved, and committed**; see "Module 12 — Artwork Likes"
below for the full write-up. Module 11 (Artwork Detail Page) — ArtVault's
first dedicated public URL for one specific artwork, `/artworks/{artworkId}`.
Full image gallery (real proportions preserved, keyboard-operable
thumbnails), title, artist identity linking to the artist's own page, price,
full description, category, tags, the existing WishlistButton, and real
sharing (native Web Share with an honest copy-link fallback — no fabricated
share counts). Every artwork-card consumer (Marketplace, the artist page's
own grid, Home, Wishlist) now links its image/title into this page instead
of straight to the seller's catalog; `PublicArtworkCard` owns this
navigation split itself (image+title → the artwork, artist name → the
artist — two genuinely different destinations). Required **zero**
`firestore.rules` changes — the exact security property this page depends
on (a signed-out visitor can read one `PUBLISHED` artwork directly; DRAFT/
SUBMITTED/REJECTED cannot) was already fully proven since Module 07, re-run
unchanged and still 148/148 passing. A new `getPublicArtwork` repository
function (distinct from Wishlist's `getArtwork`) gives this page real
error/retry behavior instead of collapsing a genuine network failure into
the same "not found" state a private artwork correctly gets. No commerce
CTA (no Buy Now/Add to Cart, not even a disabled placeholder) and no
fabricated reviews/ratings/stock urgency/delivery estimates anywhere on the
page, per explicit owner instruction. **Implementation, automated tests
(554/554), typecheck, lint, and build all clean, with real-browser visual
and keyboard/focus verification across 1920/1440/1280/1024/768/430/390/360
— complete and awaiting owner review; not yet committed**; see "Module 11 —
Artwork Detail Page" below for the full write-up. Module 10 (Product UI/UX
Foundation — desktop shell width, Newsreader display typography,
width-driven ResponsiveGrid, measured WCAG AA contrast remediation, and a
real Home-page composition sourced entirely from live marketplace data) is
**complete, owner-reviewed and approved, and committed** (`fffe2a0`); see
"Module 10 — Product UI/UX Foundation" below for the full write-up. Module 09
(Wishlist) — a save/heart control on
every public artwork card (Marketplace and the artist page) and a public
`/wishlist` page. Signed-out visitors save locally (`localStorage`, no
sign-in wall — a deliberate, explicitly-approved low-friction UX decision)
and a one-time, duplicate-safe merge moves those ids into a real Firestore
wishlist (`wishlists/{uid}/items/{artworkId}`) the moment they sign in.
Exactly one Firestore listener for a signed-in account's whole wishlist,
shared by every card and the page itself, never one per card. Required
**no change to any existing rule**, including `artworks/{artworkId}`'s own
— a wishlist entry stores no artwork data at all, so it can never make a
private artwork readable. Likes and Follows were seriously considered
alongside Wishlist and deliberately deferred instead, specifically because
either would have required opening a new write exception on an
already-hardened public document (`artworks`/`artists`), a materially
different and riskier kind of change than a brand-new private collection.
**Implementation, automated tests, and real end-to-end verification
(guest save → refresh → sign-in merge → cross-page consistency → a second
real account confirmed unable to see it, all in a real browser against the
real owner's own account and artwork) all complete, owner-reviewed and
approved, and committed** (`e573d6d`); see "Module 09 — Wishlist" below for
the full write-up. Module 08 (Marketplace — Public Artwork Browsing &
Search/Filtering) — ArtVault's first cross-seller public discovery
surface: a public `/explore` route querying `artworks` for
`status == 'PUBLISHED'` across every seller (no `sellerId` filter at all,
the first query of its kind in this codebase), with Firestore-native
category/price-range filtering, three sort orders, and real cursor-based
"load more" pagination via a new `useMarketplaceArtworks` (TanStack Query
`useInfiniteQuery`) — the first feature in this codebase read through
TanStack Query rather than a live `subscribeX` listener. Required **no**
`firestore.rules` change: Module 07's own `PUBLISHED`-read rule already
covered a cross-seller query, since Firestore evaluates rules per-document,
never by query shape — proven by a new dedicated rules-test suite, not just
asserted. **Implementation, automated tests, and real end-to-end
verification all complete, owner-reviewed and approved, and committed**
(`64fbcf5`) — this same commit also introduced permanent isolated
Firestore/Storage rules-test infrastructure (`firebase.test.json`,
`firebase emulators:exec`, a fail-closed runtime guard in
`test-support/emulatorTestEnv.ts`) after an incident where running those
suites directly against the persistent dev emulator wiped its real data;
see "Module 08 — Marketplace" below for the full write-up. Module 07 (Artwork Moderation &
Publishing) — ArtVault's first genuine public artwork lifecycle: two new
artwork statuses (`PUBLISHED`, `REJECTED`), a trusted Admin-SDK-only
operator script (`functions/src/publishArtwork.ts`) as the sole path from
`SUBMITTED` to either, a new narrowly-scoped public read path on
`artworks/{artworkId}`, and Module 06's public artist page now querying and
rendering real `PUBLISHED` artwork instead of a static empty state —
**implementation, automated tests (including a real pre-existing security
gap found and closed by this module's own new tests), and real end-to-end
verification (real owner account, real Playwright-driven UI submit, real
trusted-CLI publish/reject, real signed-out public-page checks, and a real
emulator restart) all complete, owner-reviewed and approved, and
**committed** (`a6aa668`, full hash
`a6aa668775ecad86e625ff1458fdbc0fef870c85`, on top of `d917e4f`)**; see
"Module 07 — Artwork Moderation & Publishing" below for the full write-up.
Module 06 (Artist Profiles) — ArtVault's first public-facing feature: a
public `artists/{artistId}` projection, a public `/artists/:artistId` page,
and a Seller Studio surface for managing it — **implementation, tests,
real-emulator verification, and the owner's own manual verification
(including the real signed-out/incognito route retest) all complete,
verified, owner-approved, and committed** (`d917e4f`); see "Module 06 —
Artist Profiles" below for the full write-up. Module 05 (Artwork Media/Image
Upload) — Storage-backed photo upload for Seller Studio DRAFT artworks,
plus the Firebase emulator launcher lifecycle hardening it surfaced
(stale-lock identity verification, tree-aware orphan-process cleanup
covering dynamic Functions-worker ports) — **implementation, tests, and
the owner's own real upload/restart verification all complete, verified,
and committed** (`3265194`); see "Module 05 — Artwork Media/Image Upload &
Emulator Lifecycle Hardening" below for the full write-up. Module 04 Final
Hardening & Firebase Emulator
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

**Module 13 — Admin Control Center (Seller Application Review & Artwork
Moderation): Phase 1 (trusted callable-function foundation) and Phase 2
(security hardening) both implemented, fully tested (146/146 Functions,
601/601 frontend, 192/192 Firestore rules), typechecked, linted, and built
clean — owner review of Phase 2 pending, nothing committed. Phase 3 (the
Admin Control Center UI itself) has not been started.** ArtVault's first
deployed, client-reachable Cloud Functions —
`approveSellerApplication`/`rejectSellerApplication`/`moderateArtwork` —
gated by one centralized `requireAdminCaller` boundary that trusts only the
Firebase Auth-verified `request.auth.token.role` claim (ADMIN/SUPER_ADMIN),
never `request.data` or any Firestore-mirrored field. Seller rejection is a
real, owner-approved third terminal application state (Option A) alongside
PENDING/APPROVED — persistent, non-reversible, no reapplication path, with
a real `rejectionReason` field. Every underlying write still goes through
the same trusted, already-tested `promoteSellerByUid`/
`rejectSellerApplicationByUid`/`decideArtworkByArtworkId` Admin-SDK
business logic Modules 04/07 already established — the callables are thin,
reviewed authorization/validation wrappers, not a reimplementation.
`firestore.rules` required **zero** changes. See "Module 13 — Admin Control
Center" below for the full write-up, including the App Check and rate-
limiting production-readiness decisions explicitly deferred (not silently
skipped) for this phase.

Module 12 — Artwork Likes: implemented across 4 phases (migration
tooling, security rules, client feature, concurrency hardening), fully
tested (592/592 frontend, 185/185 Firestore rules), typechecked, linted,
built clean, and verified via the real client SDK against the real
Auth/Firestore emulator — complete, owner-reviewed and approved, and
committed. Sign-in-required, Detail-Page-only Likes: a denormalized
`artworks/{artworkId}.likeCount` that can only ever change atomically
alongside the caller's own `likes/{artworkId}/by/{uid}` document, proven
mutually in both directions by `firestore.rules` itself
(`exists()`/`existsAfter()`/`get()`/`getAfter()`), never a
read-then-write counter and never a `count()` aggregation (which would
have required making liker identities listable). Pre-existing artworks
backfilled to `likeCount: 0` via a trusted, dry-run-by-default Admin-SDK
script. Optimistic client UI hardened with authoritative post-failure
reconciliation: a rejected Like/Unlike batch is re-checked against real
Firestore state before deciding whether to roll back, so a real (if
narrow, emulator-specific) write-stream ambiguity found during real
concurrent-write testing can never surface as a false failure — and a
genuine authorization denial can never be reconciled into a false
success. See "Module 12 — Artwork Likes" below for the full write-up.
Module 11 (Artwork Detail Page: `c0128f4`), Module 10 (Product UI/UX
Foundation: `fffe2a0`), Module 09 (Wishlist: `e573d6d`), Module 08
(Marketplace — Public Artwork Browsing & Search/Filtering: `64fbcf5`,
which also introduced the permanent isolated rules-test infrastructure),
Module 07 (Artwork Moderation & Publishing: `a6aa668`), Module 06 (Artist
Profiles: `d917e4f`), Module 05 (Artwork Media/Image Upload & Emulator
Lifecycle Hardening: `3265194`), and Module 04 (Seller Foundation &
Artwork Draft Management: `d483994`, `1f8ca5a`, `1f0deb7`; Emulator
Persistence & Seller-Authorization Reconciliation: `877f3ba`) remain
complete, verified, and committed. See "Completed modules" for the
checkpoint entries once Module 10's, Module 11's, and Module 12's own
checkpoints are added.

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

## Module 13 — Admin Control Center (Seller Application Review & Artwork Moderation)

**Status:** Phases 1 (trusted callable-function foundation), 2 (security
hardening), 3 (Admin Control Center UI), and 4 (seller artwork edit
lifecycle, plus two real manual-test defect fixes) all implemented and
tested. Frontend: **689/689** (up from 592/592 pre-Module-13). Firestore
rules: **243/243** (up from 185/185 pre-Module-13). Functions: **146/146**
(unchanged since Phase 2 — Phases 3–4 touched no `functions/` code).
`tsc --noEmit`/`tsc -b` clean (both `functions/` and root), root `oxlint`
clean (0 errors, pre-existing warnings only), production build clean
(`AdminPage` code-splits into its own ~13.4kB/4.2kB-gzip chunk). A real
emulator crash during Phase 4's own manual testing (this machine's
documented RAM pressure) led to a new, separate durability addition — `npm
run checkpoint:emulators`, a live Auth+Firestore checkpoint mechanism using
the official `firebase emulators:export` CLI, validated via a full
controlled restart proving byte-identical Auth+Firestore restoration; see
"Emulator durability hardening" below. See "Phase 4 — Seller Artwork Edit
Lifecycle", "Manual-test defect fixes", and "Emulator durability hardening"
below for the three most recent additions. Real emulator E2E
verification (Phase 3, real `firebase/auth` + `firebase/firestore` +
`firebase/functions` **client SDK**, real dev emulator, real throwaway
accounts, real owner data confirmed untouched) — complete; see "Phase 3"
below for the full write-up, including a genuine (and disclosed, not
hidden) intermittent Firestore-emulator rules-evaluation artifact found and
characterized during that verification. **Nothing in Module 13 is
committed yet — owner review of Phase 3 is pending. Do not start Phase 4
(or any Module 14) until Phase 3 is explicitly approved.**

### Objective and scope

Every prior module gave ArtVault real seller-application and
artwork-moderation *business logic* (`promoteSeller.ts`, `publishArtwork.ts`
— Modules 04/07), but the only way to actually invoke either was a human
running a local Admin-SDK CLI script by hand. Module 13 builds the
server-side foundation a real `/admin` UI (Phase 3) will call from the
browser: deployed, client-reachable Cloud Functions wrapping that same
trusted logic behind a real authorization boundary. This makes the
authorization check the single most security-critical piece of code this
project has ever shipped — every other privileged write in this codebase
is reached only by a human with direct Admin SDK credentials, never by an
arbitrary authenticated browser session.

### Phase 1 — Trusted callable-function foundation

`functions/src/adminActions.ts` (new) — three Firebase v2 callable
functions: `approveSellerApplication`, `rejectSellerApplication`,
`moderateArtwork`. Each is a thin wrapper: `requireAdminCaller` (the one
and only authorization gate, reviewed once and reused by all three rather
than re-implemented per function) then delegates to the exact same
business logic Modules 04/07 already built and tested —
`promoteSellerByUid`, `rejectSellerApplicationByUid` (new, see Option A
below), and `decideArtworkByArtworkId`. Nothing here duplicates or
re-implements that logic. `requireAdminCaller` reads only
`request.auth.token.role` — the Callable Functions SDK's own
server-verified decoded ID token claim, the exact same claim
`firestore.rules`' `hasRole()` already reads — and admits only `ADMIN`/
`SUPER_ADMIN`; a missing `request.auth` is `unauthenticated`, anything else
is `permission-denied`.

**Seller rejection — Option A (owner-approved schema decision).** Before
Module 13, a seller application had exactly two states: PENDING and
APPROVED. Module 13 needed a real way for an admin to *decline* an
application, and the owner explicitly chose persistent rejection over
silent deletion or an eventually-reappliable state:

- `SELLER_STATUSES` (`src/features/seller-studio/types.ts`) gains
  `'REJECTED'` as a third, terminal value.
- A new `rejectionReason: string | null` field on `SellerApplication`,
  populated only alongside a REJECTED decision.
- The application document is never deleted on rejection — it remains a
  permanent record, exactly like an APPROVED one.
- There is deliberately **no** reapplication/resubmission path yet — an
  explicit scope boundary, not an oversight. `firestore.rules`'
  pre-existing `allow update: if false` on `sellers/{uid}` already makes
  this structurally impossible for any existing application regardless of
  status, so nothing new needed to be built or blocked for it.
- `rejectSellerApplicationByUid` (new, `functions/src/promoteSeller.ts` —
  co-located with its approval counterpart rather than a new file, since
  they are two outcomes of the same decision and share the same trust
  model) grants no privilege whatsoever: no SELLER claim, no
  `users/{uid}` write, no `artists/{uid}` projection. The applicant's
  existing CUSTOMER access is left completely untouched.
- `functions/src/reconcileRoles.ts` and `src/features/auth/api/
  ensureUserProfile.ts` were both updated to treat REJECTED exactly like
  PENDING (never like APPROVED) — a rejected applicant must never be
  treated as "awaiting seller reconciliation."
- Applicant-facing ripple, not Phase 3 admin UI: `SellerStatusCard`,
  `useSellerStatus`, `SellerApplicationPage`, and `AccountSections` all
  learned to render an honest "Not approved" state with the real
  `rejectionReason` (never a fabricated or generic excuse) and no fake
  reapply control — a REJECTED applicant would otherwise be stuck seeing
  themselves as permanently "pending review," which is worse than telling
  them the truth. This is the minimal, necessary consequence of adding a
  third schema state, not the start of Phase 3.

**`decideArtworkByArtworkId` (`publishArtwork.ts`)** gained no new states
(PUBLISHED/REJECTED already existed since Module 07) — only the Phase 2
transactional hardening described below, and threading `rejectionReason`
through unchanged.

**`firestore.rules` — zero changes, and none were needed.** Every Module 13
write goes through the trusted Admin SDK from inside a callable function,
which always bypasses client-side security rules entirely. The only rules
question Option A raised — "can a client ever forge or resurrect a
REJECTED application?" — was already answered by Module 04's own
`allow update: if false`: a REJECTED document is exactly as immutable to
its own applicant as an APPROVED one, with no special-casing required. A
new test explicitly proves a client cannot even `create` a REJECTED
application to begin with (`isValidSellerApplication` forces
`status == 'PENDING'` regardless of what the client sends).

### Phase 2 — Security hardening

**Input validation at the server boundary.** `requireDocumentId` (used for
both `uid` and `artworkId`) rejects: non-string, blank/whitespace-only,
longer than 200 characters (deliberately generous past a real Firestore
auto-id's 20 characters, never a guess at the exact length), and — the one
genuine vulnerability class closed this phase — any forward slash or ASCII
control character. A slash in an id would make `.doc(id)` address a
different, deeper document under the same collection than the flat
document every caller intends; this is now rejected outright rather than
silently normalized. `requireBoundedText` (for `rejectionReason`) enforces
the same 500-character bound `firestore.rules`' own seller `description`
field already uses (reused, not invented) and rejects any control
character, including embedded newlines.

**Error-leakage boundary.** `toCallableError` maps only a closed allowlist
of known domain-invariant violation messages — the exact strings
`promoteSellerByUid`/`rejectSellerApplicationByUid`/
`decideArtworkByArtworkId` are already known (and already tested) to throw
— to the appropriate callable error code (`not-found` /
`failed-precondition`). Anything else — a raw Firestore/gRPC error, a
network failure, any genuinely unexpected exception — is logged
server-side for real diagnosis and replaced with one generic, safe
`internal` message. A dedicated test asserts a raw internal error message
("...internal gRPC detail the caller should never see") never reaches the
caller verbatim.

**Transactional concurrency safety.** `promoteSellerByUid`,
`rejectSellerApplicationByUid`, and `decideArtworkByArtworkId` all now run
their read-check-write inside `db.runTransaction()`. Firestore's own
commit-time optimistic-concurrency check means two truly concurrent
decisions on the same document can never both silently apply — the losing
transaction is automatically retried against a fresh, post-commit read,
which correctly re-triggers the same "already decided" domain error a
sequential second call would get. This closes a real race that existed
before this phase: two admins (or an admin and the CLI) deciding the same
application/artwork at nearly the same moment could previously have both
"succeeded," corrupting state or double-granting a claim.

**Full adversarial test matrix**, run across all three callables
(`functions/src/adminActions.test.ts`, grown from 0 to a dedicated suite):
signed-out/CUSTOMER/SELLER denied; ADMIN/SUPER_ADMIN allowed; missing role
claim denied; unrecognized role denied; lowercase `"admin"` denied (exact,
case-sensitive comparison); a client-supplied `role`/`auth` field inside
the payload proven to have zero effect (only `request.auth` is ever
consulted); missing/blank/oversized/slash-containing/control-character ids
rejected; a non-object `request.data` payload (string/array/number) proven
not to crash the handler; extra unrecognized payload fields proven never
forwarded to a write; missing/blank/oversized/control-character
`rejectionReason` rejected, required only when `decision === 'REJECTED'`;
an invalid `decision` value rejected; every write proven to touch only its
intended fields (`Object.keys` equality checks, not just
`objectContaining`); every business-logic transition invariant
(not-found, already-approved, already-rejected, non-SUBMITTED,
already-decided in either direction) re-proven at the callable-handler
layer, not just the layer below it.

**Idempotency and concurrency — tested at both layers, deliberately kept
separate:**

- *Callable-handler layer* (`adminActions.test.ts`, "idempotency —
  repeated invocation through the callable boundary"): approving/
  rejecting the same seller twice, publishing/rejecting the same artwork
  twice, and a conflicting decision in both directions after a terminal
  outcome (publish-then-reject and reject-then-publish) — proving the
  authorization/validation/delegation layer this file owns re-checks
  everything correctly on a second call rather than assuming the first
  call's success.
- *Business-logic/transaction layer* (`promoteSeller.test.ts`,
  `publishArtwork.test.ts`, "near-simultaneous callers"): real,
  deterministically-gated concurrency tests — not a naive shared-mutable-
  state race, which would prove nothing real. A controlled gate forces the
  second racing call's read to resolve only after the first call's write
  has actually committed, reproducing the *outcome* Firestore's real
  transactional commit-conflict detection guarantees (a losing racer is
  retried against a fresh, post-commit read and can never act on a stale
  snapshot) without reimplementing Firestore's own retry algorithm.
  Covers: two concurrent approvals, two concurrent rejections, and a
  conflicting approve-vs-reject / publish-vs-reject race — in every case,
  exactly one decision commits, the loser is told the real outcome, and no
  duplicate claim/profile/write is ever produced. Genuine end-to-end proof
  of Firestore's transaction guarantee under real concurrency (not a
  mocked Admin SDK) would need the real emulator and client SDK, exactly
  like Module 12 Phase 4's own disclosed limitation — not something a
  mocked-Admin-SDK unit test can or should claim to provide.

**App Check — reviewed, deliberately not enabled.** Documented in
`adminActions.ts` and here: neither `onCall()` call passes
`enforceAppCheck`, and none of the three handlers reads `request.app`, so
enabling `enforceAppCheck: true` later is a pure additive change requiring
no restructuring. Not enabled now because production App Check
registration (reCAPTCHA Enterprise / Play Integrity / App Attest) does not
exist yet for this project, and enabling enforcement without it would only
block local emulator development. **Recorded here as a required
pre-production-deployment step**, not a silently forgotten TODO.
Authentication and ADMIN/SUPER_ADMIN authorization remain fully mandatory
regardless — deferring App Check changes nothing about `requireAdminCaller`.

**Rate limiting / abuse protection — analyzed, deliberately not
implemented in-process.** A non-admin caller is rejected by
`requireAdminCaller` before any Firestore access, so an unauthorized
caller cannot drive cost/load regardless of request volume; a genuine
ADMIN/SUPER_ADMIN account calling repeatedly is already bounded by the
transactional idempotency guarantees above (repeats become inert
errors, never a compounding effect). An in-memory/per-Cloud-Functions-
instance rate limiter was deliberately **not** built: each instance has
isolated memory, so such a limiter would provide no real limit under
normal auto-scaling — shipping that as "rate limiting" would be exactly
the kind of fake, unreliable security control this project refuses to
ship. **Recorded as a required pre-production-deployment decision**
(genuine distributed rate limiting — a shared Firestore/Redis counter, or
a platform control like Cloud Armor / App Check's reCAPTCHA Enterprise
scoring) if this endpoint's real-world abuse profile is judged to need it.

### Phase 3 — Admin Control Center UI

**The real `/admin` route.** `src/app/routes/AdminPage.tsx`, gated by
`RequireAuth` → `RequireRole(['ADMIN', 'SUPER_ADMIN'])` in `router.tsx` —
the exact same nesting pattern the SELLER-gated `seller-studio/*` routes
already established, never a new authorization mechanism. This guard is UX
convenience only, per its own doc comment; the real authority is
`requireAdminCaller` (Phases 1–2) plus this phase's own new Firestore rules
grant (below) — never `users/{uid}.role`, `sellers/{uid}.status`, a
client-supplied value, or a query parameter. The nav item
(`src/app/navigation/navItems.ts`) already existed as `comingSoon`, flipped
to `available` — `useNavItems` (unchanged) already centralizes all
audience filtering, so a CUSTOMER/SELLER/guest never sees a clickable Admin
link, independent of the route guard itself.

**A genuine, necessary `firestore.rules` change — explained, not silently
made.** Reviewing what "Query real PENDING seller applications" /
"Query real SUBMITTED artworks" (the owner's own Phase 3 spec) actually
requires exposed a real gap: no rule anywhere granted ADMIN/SUPER_ADMIN any
Firestore read access at all — every prior privileged operation went
through the Admin SDK, which always bypasses rules, so no client-side read
was ever needed for one before this phase. The two queue queries the
owner's spec calls for are genuine client-side Firestore reads (matching
how every other list/query in this app already works — Marketplace,
Wishlist, Seller Studio — never a callable for a read), so the alternative
(a `listPendingSellerApplications` callable) would have been the first
read-only callable in this codebase and inconsistent with its own
established architecture. The fix: a new `isAdmin()` helper
(`hasRole('ADMIN') || hasRole('SUPER_ADMIN')`, reusing the same
`hasRole()`/token-claim mechanism already established for SELLER) plus two
purely additive `||` read grants, each as narrow as the feature requires
and nothing broader:
- `sellers/{uid}`: `isOwner(uid) || (isAdmin() && resource != null && resource.data.status == 'PENDING')` —
  an admin can read a PENDING application only, never an already-decided
  (APPROVED/REJECTED) one.
- `artworks/{artworkId}`: a third branch, `isAdmin() && resource != null && resource.data.status == 'SUBMITTED'` —
  an admin can read a SUBMITTED artwork only; DRAFT stays exactly as
  owner-private as before, PUBLISHED was already public.

Neither existing branch, nor any write rule, was touched. 16 new rules
tests (8 per collection) prove: ADMIN/SUPER_ADMIN can read the intended
status only, are denied for every other status, a non-admin gets no new
access, a query for the wrong status is denied outright (not just
unlisted), and the new read grant confers no write capability. `resource !=
null` is required before touching `resource.data` on both new branches —
real-emulator testing surfaced that omitting it can throw a genuine
Firestore rules "Null value error" for a `list` query, the same class of
failure the pre-existing artworks PUBLISHED/owner branches already guard
against and document.

**Client Functions SDK — first use in this codebase.**
`src/lib/firebase/config.ts` gains `export const functions =
getFunctions(firebaseApp)` and `connectFunctionsEmulator(...)` inside the
existing `connectFirebaseEmulators()`, mirroring the Auth/Firestore/Storage
pattern already there exactly. No region argument: no function sets a
region override, so the SDK default (`us-central1`) already matches.

**Typed admin API layer.** `src/features/admin/api/adminApi.ts` —
`approveSellerApplication`/`rejectSellerApplication`/`moderateArtwork`,
each exactly one `httpsCallable(...)` call. `toAdminActionError` passes a
real callable error's message through verbatim (Phase 2's own
`toCallableError` already guarantees every `functions/*`-coded message is
safe to show) and replaces anything else (a genuinely unexpected
client-side failure — offline, a malformed response) with one generic
fallback, logged client-side (`console.error`) for diagnosis. No component
ever calls `httpsCallable` directly.

**Read layer.** `src/features/admin/api/adminQueueRepository.ts` —
`getPendingSellerApplications`/`getSubmittedArtworks`, one-shot `getDocs`
reusing the existing, already-tested `mapToSellerApplication`
(newly exported from `sellerRepository.ts`, mirroring how `mapToArtwork`
is already exported and reused) and `mapToArtwork`. `src/features/admin/
hooks/{usePendingSellerApplications,useSubmittedArtworks}.ts` wrap these in
plain TanStack `useQuery` — matching the one-shot-list precedent `useLike`/
`usePublicArtwork` already established, not a new pattern.

**Mutation layer — the server response is authoritative, never
optimistic.** `src/features/admin/hooks/{useApproveSellerApplication,
useRejectSellerApplication,useModerateArtwork}.ts` — plain TanStack
`useMutation`. `isPending` is the only double-click guard (no separate
local state): a control is disabled from the moment `.mutate()` is called
until the promise settles. `onSuccess` invalidates the relevant queue query
— a real refetch, never a local optimistic removal — so an item only
disappears once Firestore itself no longer matches the query. `onError`
shows a toast and leaves the item in the queue untouched, so a failed
action is always visibly retryable, never silently lost.

**UI.** `AdminPage.tsx` — two ARIA tabs (`role="tablist"`/`"tab"`/
`"tabpanel"`, real `aria-selected`), "Seller Applications"/"Artwork
Moderation" with a live, server-derived count in each label (never a
fabricated number — no count renders at all until its query resolves).
`SellerApplicationQueue`/`ArtworkModerationQueue` — real
loading/error/empty/populated states (`Skeleton`/`ErrorState` with a real
retry action/`EmptyState`, all reused from the existing design system, no
new visual language). `SellerApplicationCard`/`ArtworkModerationCard` —
read-only presentational cards showing only real, existing data (business
name/contact/description/applied date; artwork thumbnail-or-fallback/
title/artist name via the existing `useArtistDisplayNames`/description/
price/category/updated date) — no fabricated statistics anywhere.
`ModerationActionModal` — one shared `Modal`-based confirm/reason dialog
reused across all four approve/reject call sites rather than four separate
dialogs: `requireReason` toggles whether a reason field renders at all;
client-side validation mirrors the server's own bound exactly (non-blank,
≤500 characters after collapsing internal whitespace/newlines to a single
space — a `<textarea>` invites multi-line typing, but the server's
`rejectionReason` validation rejects any control character including
newlines, so this normalization matches the real contract instead of
surprising an admin with a rejected submission over ordinary paragraph
typing); resets its own field whenever reopened, so a previous dialog's
text can never leak into a new one.

### Real emulator E2E verification (Phase 3)

No genuine browser DOM/E2E automation was performed — this environment has
no such tool, exactly as every prior module's own verification has
disclosed. Verification instead used the real `firebase/auth` +
`firebase/firestore` + `firebase/functions` **client SDK** (first-ever use
of the Functions client SDK in this codebase) against the real running dev
emulator (`npm run emulators`, real persisted owner data), signed in as
real fresh throwaway test accounts, matching Module 12 Phase 4's own
established methodology exactly.

**What was verified, end to end, with real resulting Firestore state
inspected via the Admin SDK (never assumed):**
- CUSTOMER and an unprivileged applicant (no admin claim) are both denied
  the Firestore query (`permission-denied`) and the callable
  (`functions/permission-denied`) — never merely hidden by the UI.
- ADMIN can query and see a real PENDING application and a real SUBMITTED
  artwork; SUPER_ADMIN can too.
- A real approval: `sellers/{uid}.status` becomes `APPROVED`, `reviewedAt`
  is set, the real Firebase Auth custom claim becomes `SELLER` (verified
  via a forced ID-token refresh — the real "does the UI need a token
  refresh to see a new claim" concern the owner's spec called out
  explicitly), `users/{uid}.role` mirrors it when that document exists,
  and a real `artists/{uid}` profile is created.
- A real rejection: `status` becomes `REJECTED`, the real `rejectionReason`
  is stored exactly as sent, no SELLER claim is ever granted, no artist
  profile is ever created.
- A real artwork publish/reject: `status` becomes `PUBLISHED`/`REJECTED`
  correctly, `rejectionReason` behaves correctly in both directions, and
  unrelated fields (title, price) are verified byte-for-byte untouched.
- Re-approving an already-decided application through the real callable
  fails cleanly (`functions/failed-precondition`), never a double-grant —
  the Phase 2 transactional guarantee holding under a real callable
  invocation, not just a mocked one.
- The real owner account (`bm440946@gmail.com`) and every pre-existing
  document were confirmed byte-identical before and after (same seller/
  artwork/artist document ids, same 10 real Auth accounts) — every
  throwaway account/document this verification created was deleted
  afterward, including two accidental leftovers from the debugging session
  below, found and removed via an explicit before/after diff rather than
  assumed clean. One unrelated, pre-existing orphan document
  (`alice@example.com`, not matching any script this session ran) was
  found in `users/{uid}` and deliberately left untouched rather than
  guessed at.

**A genuine, disclosed finding: an intermittent Firestore-emulator
rules-evaluation artifact under this machine's own well-documented severe
RAM pressure**, investigated rather than assumed away, in the same spirit
as Module 12 Phase 4's own concurrency-artifact writeup:
1. The Functions emulator itself intermittently failed to finish
   discovering the deployed functions within its default 10-second budget
   ("Cannot determine backend specification. Timeout after 10000"),
   consistent with this project's own previously-documented RAM exhaustion
   (as low as 0.55GB free during Module 10; 1.46GB free of 7.67GB observed
   during this verification). Fixed by setting firebase-tools' own
   officially-documented `FUNCTIONS_DISCOVERY_TIMEOUT` environment
   variable — the sanctioned mitigation the error message itself links to
   — not a workaround invented for this session.
2. Once functions loaded, the new admin Firestore-rules read grants
   intermittently (roughly half the time, non-deterministically) returned
   a spurious "Null value error" on the very first `list` query issued
   against a collection in a session, denying an otherwise-legitimate
   ADMIN request. Root-caused via isolated, incrementally-narrowed
   reproduction scripts (never assumed): the rule logic itself is correct
   — an identical isolated repro querying the same rule succeeded 100% of
   many trials, and the same query always succeeds when it succeeds at
   all, importantly **always in the fail-safe direction** (a spurious
   *denial*, never a spurious *grant* — no trial ever returned data it
   should not have). This is characterized as a genuine, narrow Firestore
   **emulator** artifact under real memory contention — the same category
   of finding, and the same investigative standard, Module 12 Phase 4
   already established for this codebase — not a security defect, and not
   glossed over. The deterministic, isolated `npm run test:rules` suite
   (208/208, run twice, both clean) independently confirms the rule logic
   itself is correct regardless of this runtime artifact.
- Every throwaway account/document was deleted; the isolated debugging
  session above is also disclosed above rather than omitted, including the
  two categories of accidental leftovers it produced and how they were
  found and removed.
- Every emulator process (the persistent dev emulator, restarted twice
  during this debugging; the isolated rules-test emulator, run twice more
  afterward) was confirmed fully stopped (no lingering node/java
  processes) before this verification concluded. `./emulator-data`'s own
  file mtime was confirmed unchanged from before this session at every
  checkpoint — the real owner's persisted data was never at risk, since no
  export ever occurred until a deliberate, verified-clean final state.

### Testing

- Functions: **146/146** (`npx vitest run --pool=forks --maxWorkers=1`,
  mocked Admin SDK, no emulator involved), unchanged from Phase 2 — Phase 3
  touched no `functions/` code.
- Firestore rules: **208/208**, up from 192/192 after Phase 2 (16 new
  Phase 3 tests — 8 per collection, covering the new ADMIN queue-read
  grants), via `npm run test:rules` against the permanent isolated,
  disposable rules-test infrastructure — never the persistent dev emulator.
  Run twice at the final rule text, both clean. Verified fully shut down
  afterward both times (no lingering node/java processes).
- Frontend: **657/657**, up from 601/601 after Phase 2 (56 new tests: the
  full Phase 3 admin feature — `adminApi`, `adminQueueRepository`, both
  queue components' full loading/error/empty/populated/approve/reject/
  duplicate-click matrices, the shared `ModerationActionModal`'s validation
  edge cases, `AdminPage`'s tab/count behavior, the `/admin` route-guard
  matrix — plus one genuine pre-existing test fixed, not weakened:
  `useNavItems.test.ts`'s "never renders a comingSoon item" assertion
  needed the Admin nav item added to its allow-list now that Module 13
  makes it genuinely available, exactly the same kind of update this same
  test already needed once before when Seller Studio shipped).
- `tsc -b` (root) and `tsc --noEmit` (functions) both clean. Root
  `oxlint`: 0 errors, pre-existing warnings only (one new warning matches
  an already-accepted `set-state-in-effect` pattern used elsewhere in this
  codebase, e.g. `WishlistProvider.tsx`). Production build (`vite build`):
  clean — `AdminPage` code-splits into its own ~13.4kB/4.2kB-gzip chunk, no
  new regressions elsewhere (the one pre-existing >500kB chunk warning is
  unrelated).
- Real emulator E2E verification (see above) — complete, with a disclosed,
  investigated, root-caused-as-far-as-possible emulator artifact, never a
  security finding.
- Every gate run sequentially, `--maxWorkers=1` where applicable, per this
  machine's known RAM constraints — nothing run in parallel; only one
  emulator instance running at any moment throughout.

### Known limitations / deliberately deferred

- App Check enforcement and distributed rate limiting remain explicitly
  deferred to before production deployment (Phase 2's own decision,
  unchanged) — not implemented, not silently assumed unnecessary.
- No idempotency key / request-deduplication mechanism exists beyond
  `isPending`-based UI disabling — safe (the Phase 2 transactional
  guarantee, now also confirmed under a real callable invocation, means a
  duplicate never succeeds twice), but a sufficiently fast double-click
  before React re-renders the disabled state could still in principle fire
  a second request that then visibly fails as "already decided" rather
  than being silently absorbed.
- No responsive/visual verification was performed via real browser
  screenshots (no such tool exists in this environment, per every prior
  module's own disclosed limitation) — the admin UI reuses this
  codebase's already-screenshot-verified design system primitives
  (`Card`/`Modal`/`Skeleton`/`EmptyState`/`ErrorState`/`Button`/`Badge`)
  exclusively and follows the same `ResponsiveGrid`-free, flex-based
  stacking every other list-of-cards surface in this app already uses, but
  this specific page's own real-viewport appearance has not been visually
  confirmed.
- The intermittent Firestore-emulator rules-evaluation artifact
  characterized above is a real, disclosed, unresolved *emulator*
  limitation (this machine's own severe RAM pressure is the suspected
  trigger) — not fixed, because it isn't application code; a production
  Firestore deployment (real, not emulated) has never been observed to
  exhibit anything like it in any prior module.

### Manual-test defect fixes (found by the owner's own Phase 3 walkthrough)

Two real defects surfaced during the owner's first hands-on `/admin` test
pass, both fixed and regression-tested before Phase 4 began:

1. **The Account page showed "Customer" for a real ADMIN account, and
   offered "Become a seller."** Root cause: `AccountHeader.tsx` displayed
   `profile.role` — the Firestore `users/{uid}` mirror — never the Auth
   custom claim; `setAdminClaim.ts` (the only path to ADMIN/SUPER_ADMIN)
   has always set the claim without ever mirroring it into Firestore
   (unlike `promoteSellerByUid`, which explicitly does both), and
   `ensureUserProfile.ts` is create-only, so a stale mirror never
   self-heals. Separately, `AccountSections.tsx`'s "Become a seller" card
   decided purely from `useSellerStatus()` (whether a `sellers/{uid}`
   document exists) with no role check at all. Fixed by sourcing the
   header's role badge from `useAuth().role` (the verified claim, falling
   back to the profile only in the narrow pre-resolution window) and by
   having the seller card render nothing at all for ADMIN/SUPER_ADMIN —
   both presentation-only, no change to authorization anywhere. 6 new
   tests, including one reproducing the exact defect (claim=ADMIN,
   stale mirror=CUSTOMER).
2. **A broken-image icon in `ArtworkModerationCard`** — its `<img>` had no
   `onError` handler, so an artwork with a real-but-invalid image URL
   showed the browser's native broken-image icon instead of the
   established `ImageOff` placeholder `PublicArtworkCard` already uses.
   Fixed by adopting the identical `imageFailed` state + `onError`
   convention. New `ArtworkModerationCard.test.tsx` (6 tests) — this
   component had no dedicated test file before.

Files: `src/features/account/components/{AccountHeader,AccountSections}.tsx`
+ `.test.tsx`; `src/features/admin/components/ArtworkModerationCard.tsx` +
`.test.tsx` (new).

### Phase 4 — Seller Artwork Edit Lifecycle

**Two pre-existing Seller Studio UI bugs fixed first**, both found while
investigating this phase, neither previously reported: `ArtworkListItem.tsx`
labeled *any* non-SUBMITTED status "Draft" — a PUBLISHED or REJECTED
artwork showed a "Draft" badge and an active "Delete draft" button that
`firestore.rules` would always deny; and `ArtworkForm.tsx`'s edit mode
rendered a fully interactive form for every status except SUBMITTED,
regardless of whether editing was actually legitimate. Fixed: every status
now gets its own accurate badge/label (`Draft`/`Awaiting review`/
`Published`/`Rejected`), delete is DRAFT-only, and `ArtworkForm` determines
the correct read-only/editable/resubmit presentation from `artwork.status`
before ever rendering a field — never relying on a disabled button
discovered after the fact.

**Lifecycle, end to end:**

| Transition | Who | Mechanism |
|---|---|---|
| DRAFT → DRAFT (edit fields) | owner | unchanged (`updateArtworkDraft`) |
| DRAFT → SUBMITTED | owner | unchanged (`submitArtwork`) |
| SUBMITTED → PUBLISHED / REJECTED | trusted admin only | unchanged (`moderateArtwork` callable → `publishArtwork.ts`) |
| **PUBLISHED → PUBLISHED** (price/inventoryCount/tags only) | owner | new: `updatePublishedArtworkSafeFields` |
| **PUBLISHED → SUBMITTED** (title/description/category/images changed) | owner | new: `resubmitArtworkForReview` |
| **REJECTED → SUBMITTED** ("Edit & resubmit") | owner | new: `resubmitArtworkForReview` (the same function — `firestore.rules` treats both as one branch) |

SUBMITTED remains completely locked for the owner in every direction,
unchanged — no branch of the update rule has ever matched a SUBMITTED
starting status, before or after this phase.

**`firestore.rules` — two new, purely additive `allow update` branches** on
`artworks/{artworkId}` (full text/rationale in the rule's own comments):
one for the safe-commerce-fields case (`hasOnly(['price','inventoryCount',
'tags','updatedAt'])`, remains PUBLISHED — `hasOnly` alone, the same
mechanism the pre-existing DRAFT branch already relies on, is what proves
title/description/category/images stayed byte-identical); one unified
branch for `(PUBLISHED || REJECTED) → SUBMITTED`, reusing
`isValidArtworkFields`/`isValidArtworkImages` unchanged and forcing
`reviewedAt`/`rejectionReason` to `null` server-side (never a client-chosen
value) so a stale or forged prior decision can never read as active during
the new review cycle. Every existing branch (DRAFT editing, DRAFT→SUBMITTED,
the Module 12 like-count sibling) is completely untouched. Images remain a
DRAFT-only concern in the shipped UI (`mutateArtworkImages` is unchanged);
the new rule branch does support an image change as part of a PUBLISHED/
REJECTED resubmission, proven by a dedicated rules test, as a deliberate
one-step-ahead-of-the-UI allowance rather than a UI gap silently baked into
the rule.

**Repository/hooks:** two new `artworkRepository.ts` functions
(`updatePublishedArtworkSafeFields`, `resubmitArtworkForReview`) mirroring
the existing `updateArtworkDraft`/`submitArtwork` style exactly; `useUpdateArtwork`
gains `updateSafeFields`/`resubmitForReview` alongside its existing
`update`/`submit`/`remove`, sharing the same status/error state.

**UI:** `ArtworkForm.tsx` now branches on the real status — SUBMITTED stays
the existing read-only "Awaiting admin review" summary; PUBLISHED renders
the same editable fields with an explanatory note ("price/inventory/tags
stay live; title/description/category require review") and a single "Save
changes" action that silently takes the safe-fields path when only those
changed, or opens a new `ConfirmResubmitModal` ("These changes require
admin review… this artwork will return to review status until approved
again") before resubmitting when a real content field changed; REJECTED
shows the real `rejectionReason` and a "Save & resubmit" action behind the
same modal (a distinct copy variant, since a REJECTED artwork has no live
marketplace visibility to lose). `ArtworkImageManager` needed **no change
at all** — it was already status-aware (`editable = status === 'DRAFT'`),
so it already renders read-only for PUBLISHED/REJECTED exactly as it
already did for SUBMITTED.

**Security invariants preserved/proven (rules tests, not just UI):** only
the real owner can ever write any of these branches (`isOwner` + unchanged
`sellerId`-immutability check, shared across every branch); no branch ever
matches a SUBMITTED starting status; no branch ever ends at PUBLISHED
except the untouched trusted-admin path; `reviewedAt`/`rejectionReason` can
never be client-supplied non-null values on a resubmission write; a forged
`sellerId` fails via the shared outer condition regardless of which inner
branch would otherwise apply; the safe-fields branch cannot be combined
with a material-content change in the same write.

### Testing (Phase 4)

- Firestore rules: **243/243**, up from 208/208 after Phase 3 (35 new
  tests across three new describe blocks — PUBLISHED safe-field edit,
  PUBLISHED material-content edit, REJECTED edit & resubmit — covering
  owner/non-owner/CUSTOMER denial, every forgeable field, invalid shapes,
  and the exact hasOnly boundaries). Run via the isolated disposable
  infrastructure, confirmed shut down cleanly afterward.
- Frontend: **689/689**, up from 669/669 after the two defect fixes (20 new
  tests: 4 repository, 2 hook, 10 `ArtworkForm`, 4 `ArtworkListItem`).
- Functions: **146/146**, unchanged — no `functions/` file touched.
- `tsc -b`/`tsc --noEmit` clean, `oxlint` 0 errors (pre-existing warnings
  only), production build clean.

### Known limitations (Phase 4)

- Image editing is not exposed in the UI for a PUBLISHED or REJECTED
  artwork — `mutateArtworkImages` remains DRAFT-only, matching its
  pre-existing scope; the rule branch supports it for a future phase, but
  building the accompanying "editing photos also requires review"
  confirmation UX was judged materially larger than this phase's own
  scope and was not attempted speculatively.
- No REJECTED artwork delete action exists (not requested; the delete rule
  is unchanged, DRAFT-only).

### Emulator durability hardening (discovered during Phase 4 manual testing)

**A real incident, not a hypothetical.** During the owner's own Phase 3
manual test pass, the emulator suite crashed on its own — this machine's
own documented severe RAM pressure (as low as ~1.1GB free of 7.67GB,
consistent with a similar finding already recorded in Module 10's own
write-up). Because `--export-on-exit` (the pre-existing, unchanged
persistence mechanism) only ever runs on a *clean* Ctrl+C shutdown, the
crash lost every change made since the emulator's last successful export —
concretely, a real owner artwork ("silver surf") that had just been
published via the new Admin UI reverted back to SUBMITTED on restart, and
every Module 13 test fixture had to be re-seeded. Nothing was corrupted —
`./emulator-data` on disk was simply never written to during the entire
session, so the restart correctly (if unhelpfully) re-imported an
older-than-intended but still completely valid snapshot.

**Fix: `npm run checkpoint:emulators`** — a new script
(`scripts/checkpoint-emulators.mjs`) that writes the *running* suite's
current Auth + Firestore state to `./emulator-data` without stopping it,
using the official `firebase emulators:export` CLI command (talks to the
already-running Emulator Hub for one atomic, cross-service-consistent
snapshot) — never a raw copy of the emulators' own live on-disk files,
which risks capturing a mid-write, inconsistent state. Shares its
validate-before-replace/backup-before-overwrite safety logic with the
pre-existing `--export-on-exit` path via a new, extracted
`scripts/lib/emulatorExport.mjs` (previously duplicated only inside
`start-emulators.mjs`; both now import the same `isCompleteExport`/
`writeSnapshotManifest`/`exportMtime`/`renameWithRetry` — a refactor with
**no behavior change** to the existing launcher, verified by a full
controlled restart afterward, see below) — a failed/incomplete/invalid
export is discarded with `./emulator-data`/`.backup` completely untouched;
a validated one only ever replaces the current checkpoint after preserving
it at `.backup` first. No automatic/periodic checkpointing was added
**deliberately** — investigated and rejected specifically for this
machine's RAM profile (an always-on timer process, plus the export
operation's own real CPU/memory cost, would more likely contribute to a
future crash than prevent one); manual checkpointing at real milestones is
documented instead (`docs/DEPLOYMENT.md`).

A real, subtle bug was found and fixed *while validating this*: two manual
test accounts (`admin-test@artvault.local`, `seller-test-2@artvault.local`)
briefly had their intended ADMIN/SELLER custom claims silently reset back
to the default CUSTOMER — root-caused to a genuine race between the
re-seeding script's own `setCustomUserClaims` call and the asynchronous
`onUserCreate` Auth trigger (which unconditionally sets `role: 'CUSTOMER'`
on every new user and can fire *after* an immediately-following explicit
claim change wins the write, depending on timing). This is a test-fixture-
script bug, not a `functions/src/setAdminClaim.ts`/`onUserCreate` defect —
the trusted mechanism itself is unaffected, since real usage always sets
the claim well after a user (and its one-time trigger) already exists.
Fixed by re-applying the claims and re-checkpointing before the validation
restart below.

**Validation — one real controlled restart**, comparing a full Auth +
Firestore snapshot (every account + role claim, both seller records, all 7
real + test artworks, both artist profiles) taken immediately before
stopping the suite against the same snapshot taken immediately after
restarting from the fresh checkpoint: **byte-for-byte identical.** Confirms
Auth and Firestore restore consistently together from one checkpoint, the
real owner account/SELLER role/3 original artworks/2 artist profiles all
survived unchanged, the corrected ADMIN/SELLER test-account claims
persisted correctly, and no security-relevant file (`firestore.rules`, any
Cloud Function, any authorization path) was touched anywhere in this work.

**Tests:** `scripts/lib/emulatorExport.test.mjs` (new, run via `npm run
test:scripts`) — successful validation of a complete export, malformed
metadata, a referenced-but-missing payload file, tamper/corruption
detection via a mismatched snapshot manifest, `writeSnapshotManifest`
writing a real valid manifest and safely no-op-ing for an incomplete
export, and `renameWithRetry`'s retry-then-succeed / exhaust-and-throw /
respect-`maxAttempts` behavior — the latter three via dependency injection
(a new, additive `rename`/`wait` injection point on `renameWithRetry`
itself, matching this codebase's existing `scripts/lib/` testability
convention) rather than attempting to reproduce a real, timing-sensitive
Windows file lock. `npm run test:scripts`: **85/85** (up from ~70 before
this addition — the exact prior count wasn't separately recorded, but
every pre-existing test in this suite is unchanged and still passing).

**A second, real bug found and fixed while building this**: the checkpoint
script's first working version failed the final rename with a genuine
Windows `EPERM` — root-caused (not assumed) to Vite's dev-server file
watcher holding a handle on the staging directory, since it didn't match
`vite.config.ts`'s existing `ignored: ['**/emulator-data/**',
'**/firebase-export-*/**']` glob. Fixed by naming the staging directory
`firebase-export-checkpoint-staging` — matching the already-ignored prefix
(deliberately *not* matching `start-emulators.mjs`'s own stricter
`/^firebase-export-\d+/` orphan-recovery pattern, so a leftover from an
interrupted checkpoint attempt can never be mistaken for that unrelated
mechanism's own stranded exports) — no `vite.config.ts` change needed.

**Files changed:** `scripts/checkpoint-emulators.mjs` (new);
`scripts/lib/emulatorExport.mjs` (new) + `.test.mjs` (new);
`scripts/start-emulators.mjs` (refactored to import the extracted logic —
no behavior change); `package.json` (`checkpoint:emulators` script);
`docs/DEPLOYMENT.md` (crash-durability behavior + recovery procedure);
this file. No `firestore.rules`, Cloud Function, or any other Module 13
application file was touched by this work.

### Files changed (Phases 1–4, uncommitted)

`firestore.rules` (`isAdmin()`, the two new admin read grants);
`firestore-tests/sellers.rules.test.ts` +
`firestore-tests/artworks.rules.test.ts` (new ADMIN queue-read-access
suites); `src/lib/firebase/config.ts` (`functions` export,
`connectFunctionsEmulator`); `src/features/admin/` (new feature —
`api/adminApi.ts` + `.test.ts`, `api/adminQueueRepository.ts` + `.test.ts`,
`hooks/{usePendingSellerApplications,useSubmittedArtworks,
useApproveSellerApplication,useRejectSellerApplication,
useModerateArtwork}.ts`, `components/{SellerApplicationCard,
SellerApplicationQueue,ArtworkModerationCard,ArtworkModerationQueue,
ModerationActionModal}.tsx` + `.test.tsx` where applicable, `index.ts`);
`src/app/routes/AdminPage.tsx` + `.test.tsx`;
`src/app/routes/adminRouteGuard.test.tsx` (new); `src/app/routes/
router.tsx` (new `/admin` route); `src/app/navigation/navItems.ts` (Admin
item flipped to `available`); `src/app/navigation/useNavItems.test.ts`
(allow-list update, see Testing above); `src/features/seller-studio/
api/sellerRepository.ts` (`mapToSellerApplication` now exported) +
`src/features/seller-studio/index.ts` (barrel export); plus everything
already listed under Phases 1–2 below.

`functions/src/adminActions.ts` (new) + `.test.ts` (new);
`functions/src/index.ts` (exports the three callables);
`functions/src/promoteSeller.ts` (`rejectSellerApplicationByUid`,
transactional hardening) + `.test.ts`; `functions/src/publishArtwork.ts`
(transactional hardening) + `.test.ts`; `functions/src/
reconcileRoles.test.ts` (REJECTED handling); `firestore-tests/
sellers.rules.test.ts` (new REJECTED-application suite);
`src/features/seller-studio/types.ts` (`REJECTED`, `rejectionReason`);
`src/features/seller-studio/api/sellerRepository.ts` + `.test.ts`
(`rejectionReason` mapping); `src/features/seller-studio/components/
SellerStatusCard.tsx` + `.test.tsx`; `src/features/seller-studio/hooks/
useSellerStatus.ts` + `.test.tsx`; `src/app/routes/
SellerApplicationPage.tsx` + `.test.tsx`; `src/features/account/
components/AccountSections.tsx` + `.test.tsx`; `src/features/auth/api/
ensureUserProfile.test.ts`.

Phase 4 additionally changes: `firestore.rules` (two new additive
`artworks/{artworkId}` update branches, see above);
`firestore-tests/artworks.rules.test.ts` (35 new tests);
`src/features/artwork/api/artworkRepository.ts` (+2 functions) + `.test.ts`;
`src/features/artwork/hooks/useUpdateArtwork.ts` (+2 mutations) +
`.test.tsx`; `src/features/artwork/components/{ArtworkForm,
ArtworkListItem}.tsx` + `.test.tsx`;
`src/features/artwork/components/ConfirmResubmitModal.tsx` (new);
`src/features/artwork/index.ts` (barrel exports). Plus the manual-test
defect fixes listed above. This file.

**Explicitly not touched:** `storage.rules`, `firestore.indexes.json`,
Wishlist, Likes, Marketplace, artist profiles, authentication, artwork
upload/Storage handling, and every DRAFT/SUBMITTED artwork-update rule
path (all unchanged, not just untested) — verified unchanged by the full,
unmodified regression suite passing alongside the new tests.

## UI-04 — Auctions Experience (COMPLETE, OWNER APPROVED, COMMITTED)

**Status: COMPLETE / OWNER APPROVED / COMMITTED.** Owner reviewed the
Auctions UI across multiple passes (initial build, a visual-matching pass
against a reference design, and a further strict reference-match
refinement pass) and approved the current implementation for commit.

### Scope

A read-only Auctions UI/UX foundation — deliberately UI-only, since no
trusted server-side auction/bidding backend exists anywhere in this
codebase (see `docs/AUCTION_ARCHITECTURE.md`, which is itself still
"design only"). Gives ArtVault a real Auctions landing page and a real
per-auction detail page, all driven by genuine (if today still empty in
production) Firestore data, with every not-yet-built capability rendered
as an honest, clearly-disabled control rather than anything fabricated.

### Routes

- `/auctions` — landing page: Upcoming Auctions / Live Now (count) / Past
  Auctions tabs, a cinematic hero (a real upcoming auction's own artwork
  photo, heavily darkened, with a gradient fallback when none exists —
  same "real photo or honest gradient, never a stock image" convention
  HomePage's own hero already established), a real "Next Auction Starts
  In" countdown (shown only when a real upcoming auction exists), and an
  auction grid built from `AuctionCard`.
- `/auctions/:auctionId` — a single detail page that renders three
  genuinely different compositions from one route, chosen by the
  auction's real, derived status:
  - **SCHEDULED/LIVE**: three-column desktop layout (gallery + AR/AI
    shortcuts | artist/description/likes/wishlist/share | bid panel +
    live bidding), collapsing to one mobile column in a fixed order
    (status → title → countdown → gallery → info → bid panel → bid
    history → info tabs → AI card) that the desktop grid never reorders.
  - **ENDED**: a dedicated "Auction Ended" result-page composition (not
    the same layout with a label swapped) — trophy/congratulations
    treatment (only when a real `winnerUid` exists), the real Winning Bid
    panel, "View Next Auction" (only when another real SCHEDULED auction
    exists) / "Explore More Artworks" CTAs, an Auction Details card, an
    honest "Bid ranking unavailable" Top Bidders panel, and a "What's
    Next?" card.
  - A shared info-tab strip (Details / Bidding History / Artist Info /
    Shipping / FAQs) appears under every status.

### Data model and Firestore rules

`auctions/{auctionId}` (matches the shape `docs/DATABASE.md` already
planned): `artworkId`, `sellerId`, `startAt`/`endAt` (explicit trusted
`Timestamp`s, never `serverTimestamp()` — see `AUCTION_ARCHITECTURE.md`'s
trusted-time model), `startingBid`, `bidIncrement`, `currentHighBid`,
`bidCount`, `winnerUid`, `winningBidAmount`, `createdAt`/`updatedAt`.
`firestore.rules` grants public `allow read: if true` (same posture as a
PUBLISHED artwork) and `allow write: if false` unconditionally — exactly
like `orders/{orderId}`'s own precedent: no trusted write path exists yet,
so this is the deliberate current truth, not a placeholder to relax
later. `auctions/{auctionId}/bids/{bidId}` is fully closed
(`allow read, write: if false`) — the public-vs-private projection of a
bid is explicitly left undecided in both design docs until real bidding
is built, so this pass never guessed at a privacy-sensitive rule it had
no authority to invent. Auction status (SCHEDULED/LIVE/ENDED) is
deliberately never stored/trusted as a field — `deriveAuctionStatus`
computes it client-side from the real `startAt`/`endAt` against the
current time, so the UI is always correct even though no
Cloud-Scheduler-style status-flipping job exists.

### Major components/hooks/repositories added

`src/features/auctions/`: `types.ts` (+`deriveAuctionStatus`,
`minimumNextBid`), `api/auctionsRepository.ts` (`fetchAllAuctions`,
`getAuction`, `mapToAuction`, `toAuctionError`), hooks (`useAuctions`,
`useAuction`, `useAuctionArtworks`, `useAuctionCountdown` +
`splitCountdown`/`formatCountdown`), and components (`AuctionCard`,
`AuctionStatusBadge`, `AuctionCountdown` (compact single-line),
`AuctionCountdownBoxes` (the prominent Days/Hours/Minutes/Seconds boxed
display used by the hero and the bid panel), `CurrentBidPanel`,
`BidHistoryPanel`, `TopBiddersPanel`). Route pages: `AuctionsPage.tsx`,
`AuctionDetailPage.tsx`. Navigation: `navItems.ts`'s `auction` entry
flipped from `comingSoon` to `available` (href corrected from the old
placeholder `/auction` to the real `/auctions`); the old hardcoded
disabled "Auctions" span in `AppTopBar.tsx` was removed since the item now
flows through the same real nav-items list as every other link;
HomePage's Auctions teaser card now links to `/auctions` instead of a
static "Coming soon" badge.

### Responsive behavior

Built entirely from ArtVault's existing dark navy/gold/purple(AI)/blue(AR)
design tokens (already the app's real theme, not a new one introduced for
this UI) — `Card`, `Badge`, `ResponsiveGrid`, `EmptyState`, `ErrorState`,
`Skeleton`. Desktop: `xl:`-gated multi-column grids on the auction grid
and the detail page's gallery/info/bid-panel composition. Mobile: every
multi-column area is a plain `flex-col`/single-column by default, so the
required stacking order is the component's own literal DOM order, never
CSS-reordered — verified by code review and the automated test suite (no
browser tool was available in this environment to visually confirm at
specific pixel widths).

### Real functionality connected

Live public Firestore reads (landing + detail, one-shot, not listeners);
real client-side Upcoming/Live/Ended bucketing and live, ticking
countdowns from real timestamps; a real linked-artwork join
(title/images/description/artist) on every card and the detail page; real
Wishlist save, real Likes (count + toggle), real Share — all reused
verbatim from `ArtworkDetailPage` against the linked artwork, not
reimplemented; real navigation wiring (top bar, mobile "More" drawer,
homepage); a real "Next Auction"/"View Next Auction" link computed from
actually-scheduled auctions, never a guess or dead link.

### Functionality intentionally deferred / not connected

- **Trusted real-time bid-placement backend** — no Cloud Function exists
  to place a bid; `CurrentBidPanel` renders real quick-bid presets, a
  custom amount input, and a Place Bid button, all disabled, with an
  honest "Bidding isn't connected yet" message. No bid is ever written
  client-side (`firestore.rules` denies it unconditionally regardless).
- **Real bid-history/live-bidding data** — `BidHistoryPanel` (shown both
  as a sidebar panel and inside the "Bidding History" tab) always states
  it isn't connected yet; the `bids` subcollection stays fully closed in
  rules (see "Data model" above).
- **Auction finalization backend** — nothing sets `status`,
  `winnerUid`, or `winningBidAmount` automatically; these fields only
  ever reflect real data if something (currently only the manual seed
  script below) writes them directly via the Admin SDK.
- **Top Bidders / bid ranking** — `TopBiddersPanel` always says "Bid
  ranking unavailable," for the same bid-privacy reason as above.
- **AI** (auction insights, "Curated with AI", "Ask ArtVault AI", AI
  Artwork Analysis) and **AR** (View in AR) — both reuse the exact same
  honest "not connected yet" modal/badge convention `ArtworkDetailPage`
  already established; neither is Auctions-specific work, both remain
  whatever their existing project-wide state already was.

### Manual-testing seed script

`functions/scripts/seed-auctions.mjs` — never imported by the app itself.
Seeds exactly 3 auctions (SCHEDULED, LIVE, and ENDED-with-a-winner) into
the *already-running* dev emulator via the Admin SDK (the one sanctioned
way to write `auctions`, since `firestore.rules` denies every client write
unconditionally). Always links to real PUBLISHED artworks already in the
emulator (queried live, reusing the same artwork across all three seeds
when fewer than 3 exist) — never a fabricated artworkId. Run from
`functions/`: `node scripts/seed-auctions.mjs`.

### Final automated test/build results (this closing commit)

`tsc -b` (root): clean. `oxlint`: clean, 0 errors (pre-existing warnings
only, none in any file this UI touched). Firestore rules:
**307/307 passing across 10 files** (up from 292/292 at UI-03's close —
one new file, `auctions.rules.test.ts`, 15 tests). Frontend test suite:
**1103/1113 passing across 130 files** (up from 1033/1035 at UI-03's
close) — the 10 non-passing are all in `router.test.tsx`, via the same
`findByRole`/`waitFor` timeout pattern documented at every prior UI
closeout on this development machine as a pre-existing,
resource-contention artifact (never a content mismatch); re-run in
isolation the same day: **15/15 passing**. Production build: succeeds
cleanly (only the pre-existing, unrelated >500kB `AuthProvider-*.js`
chunk-size advisory).

### Known limitations

No browser or screenshot tool was available in the assistant's
environment throughout this UI — every pass (including the two
reference-visual-matching passes) was verified via code/CSS review and
the automated test suite only, never an actual rendered screenshot at any
specific viewport width. `ResponsiveGrid`'s column-count breakpoints were
deliberately left unchanged (it's shared with Marketplace/Wishlist) even
though the owner's reference asked for a slightly different mobile card
density — changing a shared component's breakpoints for one caller was
judged out of scope for a UI-04-only pass. The completed-result page
intentionally omits Wishlist/Like/Share (matching the reference's own
result screen); the underlying capability is untouched and still present
on the upcoming/live states and the artwork's own page.

**Next UI: UI-05** (not started — scope is an owner decision).

## UI-03 — Seller Studio, Artwork Management & Admin Moderation Override (COMPLETE, OWNER APPROVED)

**Status: COMPLETE / OWNER APPROVED.** Owner manually retested and
confirmed every required behavior (see the "Last updated" paragraph at the
top of this file for the exact confirmation list).

### Objective and scope

Gives sellers a real Seller Studio (dashboard, My Artworks, Create/Edit
Artwork form) and gives ArtVault's admins real, trusted authority to
moderate *any* seller's artwork regardless of owner or status — building
on Module 13's callable-function foundation (`approveSellerApplication`,
`rejectSellerApplication`, `moderateArtwork`) with a fourth callable,
`suspendArtwork`. Authorization throughout is via trusted custom claims
and Firestore/Storage rules, never hidden UI alone.

### Seller Studio base build

Seller Studio dashboard (Inventory Overview, quick actions), My Artworks
list, and a single Create/Edit Artwork form (`react-hook-form` + `zod`)
shared by both flows. Responsive at desktop and mobile widths. Every
mutation goes through the existing, tested artwork repository/hooks layer
— no new ad hoc Firestore calls.

### Final seller artwork lifecycle/control rules

The complete, final capability matrix for a seller acting on their own
artwork (never reachable for a non-owner; SELLER/CUSTOMER can never act on
someone else's artwork; admin authority below is independent of this and
always wins regardless of owner):

| Status | Seller can... |
| --- | --- |
| DRAFT | Edit, Delete |
| SUBMITTED | **Locked/read-only** — no Edit, no Delete (awaiting admin review) |
| PUBLISHED | Edit, Remove from sale (→ SUBMITTED), Delete |
| REJECTED | Edit (shows the admin's rejection reason), Delete, Resubmit for review (→ SUBMITTED) |
| SUSPENDED | Edit (shows the admin's suspension reason), Delete, Resubmit for review (→ SUBMITTED) |

Editing a REJECTED or SUSPENDED artwork and resubmitting moves it back to
SUBMITTED (locked again, reappears in Admin → Awaiting review) via the
same existing confirmation modal (`ConfirmResubmitModal`) REJECTED already
used. Deleting any non-SUBMITTED artwork uses one shared confirmation
modal and safely cleans up its Storage photos via the existing deletion
mechanism. `firestore.rules`' `allow delete` covers every status except
SUBMITTED (owner-only); the PUBLISHED/REJECTED/SUSPENDED → SUBMITTED
resubmission branch is one unified rule, not three copies. `storage.rules`
mirrors this exactly (editable/uploadable/deletable for the owner on every
status except SUBMITTED). `adminLogs` (below) is untouched by either
operation — deleting or resubmitting an artwork never erases its admin
moderation history.

### Admin Moderation Override

A trusted ADMIN/SUPER_ADMIN-only `suspendArtwork` callable can move *any*
artwork — any owner, any status (DRAFT/SUBMITTED/PUBLISHED/REJECTED) —
to a new terminal-but-recoverable `SUSPENDED` status, given a required
moderation reason. Never a hard delete, for any starting status: a
seller's record may be referenced by past orders/carts/wishlists the
instant it was ever PUBLISHED, so suspension uniformly avoids destroying
anything. SUSPENDED is not publicly readable (`firestore.rules`' public
read branch requires `status == 'PUBLISHED'`), so the artwork disappears
from `/explore`, category/search listings, and the artist's public profile
immediately. The transition, plus a full audit record (admin uid, artwork
id, previous status, resulting status, reason, server timestamp), is
written atomically in one Firestore transaction to a new `adminLogs`
collection (admin-read-only, client-write `false` unconditionally — the
trusted Cloud Function is the only writer). `adminLogs` is never
cascade-deleted and never rewritten by a later resubmission, so admin
moderation history is preserved regardless of what the seller does to the
artwork afterward. SELLER/CUSTOMER callers are rejected with
`permission-denied` before any Firestore access is attempted. Surfaced in
the existing Admin Control Center (`ArtworkModerationQueue`'s by-ID lookup,
`ArtworkModerationLookup`) — never added to seller-facing pages.

### Artwork ID visibility

A previously-missing, owner-requested affordance: the real Firestore
artwork document id is now visible, read-only, with a Copy button
(`ArtworkIdField`), on both the public Artwork Detail page and the
seller's own Edit Artwork page — no other internal field exposed.

### Real defect fixes (reproduced and root-caused against the live dev emulator, not guessed from code)

- **Admin Suspend "internal [0]"** — root cause: `functions/lib` was stale
  relative to `functions/src` (the emulator hadn't been rebuilt since
  `suspendArtwork` was added), so the client's `httpsCallable` hit an
  unregistered function; the Functions emulator's 404 becomes a
  client-fabricated `FirebaseError('functions/internal', 'internal [0]')`
  with no real server code ever involved. Fixed by rebuilding
  `functions/`. A secondary bug found during the same investigation:
  `toAdminActionError` (frontend) was echoing that raw SDK-fabricated
  message verbatim instead of a safe, useful one — fixed to special-case
  `functions/internal`.
- **Seller photo upload/delete failure** — root cause: `storage.rules`
  still required `status == 'DRAFT'` for a seller to write/delete an
  artwork's photos, predating PUBLISHED/REJECTED (and later SUSPENDED)
  becoming owner-editable. Fixed by widening the rule to every status
  except SUBMITTED. A missing delete-confirmation UI for an
  already-saved photo was added to `ArtworkImageManager` at the same time.
- **Admin Suspend generic failure (recurrence)** — a second, distinct
  incident after the above fix shipped: the *running* Functions emulator's
  one-time trigger-discovery cache had gone stale again relative to a
  later `functions/lib` rebuild (an emulator hot-reload gap, not a code
  regression — confirmed by calling `suspendArtworkByAdmin` directly via
  the Admin SDK, which succeeded immediately, while the real callable HTTP
  endpoint reported the function as unregistered). No code changed;
  rebuilding `functions/` again forced the emulator to re-discover every
  trigger, proven via a live, end-to-end reproduction: a freshly-minted
  ADMIN token's `suspendArtwork` call succeeded, a CUSTOMER token's call
  was correctly denied, and a matching `adminLogs` entry appeared.

### Security

- Owner-only `allow delete`/edit/resubmit on every path — never weakened
  for any status, including the widenings above.
- Admin moderation authority is completely independent of, and always
  overrides, seller ownership — verified by dedicated tests (ADMIN/
  SUPER_ADMIN can suspend another seller's artwork in any status; SELLER/
  CUSTOMER cannot call `suspendArtwork` at all).
- SUBMITTED remains the one status no owner action (edit/delete/resubmit)
  can ever touch, for either the seller or a non-owner.
- `adminLogs`: admin-read-only, `allow write: if false` unconditionally —
  the Cloud Function (trusted Admin SDK, bypasses rules) is the only
  writer, by design.

### Files changed (cumulative across this UI)

`firestore.rules`, `storage.rules`; `functions/src/adminActions.ts` +
`.test.ts`, `functions/src/moderateArtworkRemoval.ts` (new) + `.test.ts`,
`functions/src/index.ts`; `firestore-tests/artworks.rules.test.ts`,
`firestore-tests/adminLogs.rules.test.ts` (new);
`storage-tests/artworkImages.rules.test.ts`;
`src/features/artwork/{types.ts, index.ts}`;
`src/features/artwork/api/artworkRepository.ts` + `.test.ts`;
`src/features/artwork/hooks/{useArtworkImages.ts, useUpdateArtwork.ts,
useArtworkLifecycleActions.ts (new)}` + tests;
`src/features/artwork/components/{ArtworkForm, ArtworkListItem,
ArtworkImageManager, ArtworkIdField (new), ConfirmResubmitModal,
ConfirmDeleteArtworkModal (new), ConfirmRemoveFromSaleModal (new)}.tsx` +
tests; `src/features/admin/{index.ts, api/adminApi.ts, hooks/
useSuspendArtwork.ts (new), components/{ArtworkModerationCard,
ArtworkModerationQueue, ArtworkModerationLookup (new)}.tsx}` + tests;
`src/features/seller-studio/components/SellerStudioShell.tsx` + new test;
`src/app/routes/{ArtworkDetailPage, ArtworkListPage (+ new test),
SellerProfilePage, SellerStudioHomePage, router}.test.tsx`/`.tsx`.

**Explicitly not touched:** UI-01, UI-02, checkout/orders, primary
navigation structure, Admin UI visual design, authentication.

### Final automated test/build results (this closing commit)

`tsc -b` (root) and `tsc --noEmit` (`functions/`): both clean. `oxlint`:
clean, 0 errors (pre-existing warnings only, none in any file this UI
touched). Functions test suite: **179/179 passing across 9 files**.
Firestore rules: **292/292 passing across 9 files** (up from 268/268 at
UI-02's close). Storage rules: **22/22 passing**. Frontend test suite:
**1033/1035 passing across 116 files** (up from 939/939 at UI-02's close)
— the 2 non-passing are both in `router.test.tsx`, via the same
`findByRole`/`waitFor` timeout pattern documented repeatedly throughout
this UI's development as a pre-existing, machine-specific (8GB RAM)
resource-contention artifact of this development machine, never a content
mismatch; re-run in isolation the same day: **15/15 passing**. Production
build: succeeds cleanly (only the pre-existing, unrelated >500kB
`AuthProvider-*.js` chunk-size advisory).

**Not visually verified by the assistant.** No browser or screenshot tool
was available in the assistant's environment throughout this UI — every
round was verified via code inspection, live-emulator reproduction (for
the real defect fixes above), and automated tests. The owner performed
the real manual retest and gave the final approval recorded at the top of
this file.

**Next UI: UI-04** (not started — scope is an owner decision).

## UI-02 — Cart, Checkout, Orders & Account Experience (COMPLETE, OWNER APPROVED)

**Status: COMPLETE / OWNER APPROVED.** Owner manually reviewed on desktop
and at 350px mobile width and approved: Artwork Detail's Add to Cart,
`/cart`, `/checkout`, `/orders`, `/account`, the desktop responsive layout,
and the 350px mobile responsive layout.

**Cart.** A real, Firestore-backed cart — `carts/{uid}/items/{artworkId}`,
deliberately just `{ quantity, addedAt }`, no price snapshot — resolved
against the *live* artwork document at render time (`useCartLines`, same
one-shot-`getArtwork`-per-id/TanStack-cache discipline as Wishlist's own
`useWishlistArtworks`), so price always stays authoritative on
`artworks/{artworkId}` alone. Guest (`localStorage`) and signed-in dual
mode via a new `CartProvider`, mirroring `WishlistProvider`'s merge-on-
sign-in semantics exactly (add local quantities on top of any existing
server quantity, never overwrite, clear local storage only once every
write succeeds). `/cart` shows real line items — thumbnail, title, seller,
category, live unit price, a quantity stepper capped to the artwork's real
`inventoryCount`, remove, and "Save for later" (moves the line to
Wishlist) — plus a real Order Summary (subtotal from live prices;
shipping/taxes shown as the explicitly-sanctioned "Calculated at
checkout" placeholder, never a fabricated number). `AddToCartButton`
replaced Artwork Detail's honest UI-01 placeholder; "Buy Now" adds the
item and navigates straight to `/cart`.

**Checkout.** Protected by `RequireAuth`. Contact section reads the real
signed-in account's email/phone. Shipping Address is a real, validated
(`react-hook-form` + `zod`) form — deliberately session-only: no
`addresses` collection exists anywhere in this codebase, so rather than
inventing persistence the form says plainly that saving an address for
future orders isn't connected yet. Delivery and Payment are honest,
non-functional sections ("Shipping options aren't connected yet." /
"Payment integration is not connected yet.") — "Place Order" stays
genuinely disabled, and nothing in this codebase ever writes an order.

**Orders — read-only foundation.** `orders/{orderId}` and
`orders/{orderId}/items/{itemId}` were added to `firestore.rules` with
`allow write: if false` **unconditionally on both** — there is no client
*or* trusted-server write path for orders anywhere yet, the same
"server stays authoritative" precedent `publishArtwork.ts` already set for
trusted review. A buyer may only read their own orders
(`buyerId == request.auth.uid`). My Orders (`/orders`) and Order Details
(`/orders/:orderId`) are real, fully wired pages that — correctly and
honestly — show "No orders yet" for every account today, ready for real
data the moment a future trusted order-creation operation exists. Order
Confirmation (`/checkout/confirmation/:orderId`) only ever renders its
success state for an order whose `paymentState` is genuinely `PAID`; since
no order can yet be created, this page is real and tested but currently
unreachable through any flow in the app — the intended, honest result,
not a gap.

**Account.** Orders and Wishlist became real linked tiles (previously
disabled UI-01 placeholders); a real Sign Out tile was added alongside
them. Addresses/Payment methods/Notifications/Security/Reviews/Settings
remain honest disabled placeholders — no backend exists for any of them
yet. Role visibility preserved throughout: the Orders tile stays
CUSTOMER/SELLER-only (ADMIN/SUPER_ADMIN have no commerce identity to order
with), Wishlist stays open to every role, and Seller Studio/Admin entries
are unaffected.

**Navigation.** Cart and Orders flipped from `comingSoon` to `available`
in the single shared `NAV_ITEMS` list, so both now appear as real links in
the bottom-nav "More" drawer and the hamburger drawer for CUSTOMER/SELLER.
The top bar's Cart icon became a real link with a live item-count badge —
and was explicitly excluded from the top bar's separate inline text-nav
row, catching a real duplicate-navigation regression (Cart already has
its own dedicated icon there) before it shipped, via a new dedicated test.
The primary bottom-nav row stays capped at exactly 5 entries, unchanged
from UI-01; it is a flex sibling in the page column, not a fixed overlay,
so it has never been able to hide page content beneath it.

**Security.** `carts/{uid}/items/{artworkId}`: owner-only read/write, a
narrow field allow-list, `addedAt` immutable after creation, quantity
capped at 99 as a sanity bound only (never a substitute for real inventory
enforcement, which remains a future trusted checkout's job). `orders`:
read-only as described above. A Firestore composite index was added for
`orders` (`buyerId` ascending + `createdAt` descending).

**Intentionally deferred (stated honestly everywhere in the UI, never
fabricated).** No payment provider is integrated — no Stripe/Razorpay
keys, no `payments` collection, no Cloud Function. No real order can be
created yet — order creation, inventory deduction, and status transitions
all require a future trusted server operation that doesn't exist. No
delivery/shipping-rate integration exists. No `addresses` collection
exists — Checkout's shipping address is session-only by design, never
persisted for reuse on a future order.

**Final automated test/build results (this closing commit).** `tsc -b`:
clean. `oxlint`: clean, 0 errors (pre-existing warnings only, none in any
file this pass touched). Frontend test suite: **939/939 passing across
112 files** (up from 793/793 at UI-01's close — 146 new/changed tests
added, including dedicated Cart/Checkout/Orders coverage at the
repository, provider, hook, component, and route levels; none removed).
Firestore rules: **268/268 passing across 8 files** (two new:
`carts.rules.test.ts`, `orders.rules.test.ts`). Production build: succeeds
cleanly (only the pre-existing, unrelated >500kB `AuthProvider-*.js`
chunk-size advisory).

**Not visually verified by the assistant.** No browser or screenshot tool
was available in the assistant's environment throughout this pass — every
round was verified via code inspection and automated tests only. The
owner performed the real-browser visual verification (desktop and 350px
mobile) and gave the final approval recorded at the top of this file.

**Next UI: UI-03** (not started — scope is an owner decision).

## UI-01 — Complete Responsive Marketplace UI (COMPLETE, OWNER APPROVED)

**Status: COMPLETE / OWNER APPROVED.** A full mobile-first responsiveness
and navigation-cleanup pass across the whole app, run as several
owner-reviewed correction rounds against real reported issues, ending in
an explicit owner sign-off after visual review. Not a new feature module —
it corrects and finishes the responsive behavior of pages and shared
components built across Modules 02, 04, and 06-13, plus Module 13's own
Admin Control Center UI.

**Responsive breakpoint strategy.** A single real Tailwind v4 `@theme`
breakpoint, `--breakpoint-xs: 21.25rem` (340px), was added in
`src/index.css` alongside the framework's existing `sm`/`md`/`lg`/`xl`/`2xl`
tokens. A registered `@theme` breakpoint gets guaranteed mobile-first
cascade ordering; an earlier draft used an ad hoc arbitrary variant
(`[@media(min-width:...)]`) for the same purpose, which is what caused a
real regression (it could compile after `xl:`/`2xl:` in the stylesheet and
win at every width regardless of the intended breakpoint) — fixed by
switching to the real token. The 340px value itself was corrected once,
from an initial 360px, after the owner explicitly tested at 350px and
still saw single-column cards; the fix was re-verified by inspecting the
compiled production CSS's byte offsets to confirm both the correct
breakpoint value and the correct ascending cascade order of every
`grid-cols-*` rule. All mobile-first work was reasoned against, and where
feasible tested against, the explicit viewport set: 302, 320, 340, 350,
360, 390, 414, 430, 768, 1024, 1366, 1536px.

**Navigation structure (final).** Mobile bottom navigation
(`AppBottomNav.tsx`) is capped at exactly 5 primary entries — Home /
Explore / Wishlist / Account (or Sign in when signed out) / More — via an
explicit `PRIMARY_BOTTOM_NAV_IDS` allow-list; this replaced an earlier
draft that used the full role-aware nav-items list directly, which pushed
SELLER/ADMIN accounts to 6 tabs (caught by a new regression test before
shipping). Role-specific links (Seller Studio for SELLER, Admin Control
Center for ADMIN/SUPER_ADMIN) and Coming-Soon items (Auctions,
Notifications, Cart, Help — honestly disabled, never fabricated) live
inside the "More" drawer instead, via a new `useMoreMenuItems()` hook keyed
by audience. The standalone Categories page and its nav entry were removed
entirely — category discovery already existed inside Explore (strip +
filters + real per-category counts) and a second copy on Home/Categories
was a duplicate surface, not a second feature. `/categories` now redirects
to `/explore` (`<Navigate to="/explore" replace />` in `router.tsx`) rather
than 404ing, so any old link or bookmark still resolves.

**Explore page.** Structure preserved exactly as previously approved:
hero/search, then a compact category strip, then a result-count + Filters
+ Sort + Grid/List toolbar, then the responsive artwork grid. Two mobile
corrections this round: (1) the toolbar's control group now wraps and the
sort `<select>` is width-capped below `sm`, closing a real overflow risk
at ~340-350px; (2) the category strip scrolls horizontally below `sm`
instead of forcing a 2-column grid, which had been truncating longer
labels like "Photography" down to "Photogra...". No sidebar renders below
`lg`; Filters opens as a drawer/sheet on mobile via the existing
`MarketplaceFilters` component, unchanged.

**Artwork grid / card behavior (shared, fixed once).** `ResponsiveGrid.tsx`
uses fixed `grid-cols-N` per breakpoint (never `auto-fill`/`1fr`, which
stretched sparse results, and never unbounded `minmax`) — the final,
owner-validated column table is: **&lt;340px: 1, 340-767px: 2, 768-1279px:
3, 1280-1535px: 4, ≥1536px: 5.** Every consumer (Home, Explore, Wishlist,
Artist Profile, "More in category") shares this one component, per the
owner's explicit "fix once in shared components, never patch pages
independently" instruction. `PublicArtworkCard` itself was compacted for
mobile density (tighter padding, smaller title/price text, smaller
Wishlist/AR/AI badges, consistent `aspect-[4/5]` + `object-cover` image
area) so a 2-column mobile card reads as a normal e-commerce card, not a
near-full-screen tile.

**Home page.** The Categories chip section (and its "View all" link) was
removed entirely — category discovery now lives only on Explore. Section
spacing was tightened for mobile. The hero, Recently Published, Featured
Artists, Auctions, and "Why ArtVault" sections are all preserved with
their original copy and CTAs. "Why ArtVault" cards were corrected twice:
first to stop an icon and a "Coming soon" badge from fighting for the same
header row at narrow card widths (badge moved inline with the title
instead), then — after the owner reported these informational cards were
still being squeezed into unreadable 2-column tiles even at 350px, since
they had never actually been keyed to any breakpoint — to scroll
horizontally below `sm` instead of using a fixed grid, with description
text no longer truncated (the earlier `line-clamp-2` was removed) so the
full real sentence is always present.

**Artwork Detail page.** Structure was not rebuilt, per the owner's own
instruction ("mostly correct, do not rebuild it"); only density was
reduced — smaller gallery thumbnails, tighter AI/AR card padding (colors
unchanged: AI = purple, AR = blue), `md`-sized purchase buttons instead of
`lg`, and the descriptive AI/AR sentences hidden below `sm` so the cards
read shorter without losing information at any width with room to show it.
The Overview/Details/Shipping & Returns/Reviews tab row already scrolled
horizontally (`overflow-x-auto`, `shrink-0` per tab, no wrap) — verified,
not changed, and now covered by a dedicated regression test asserting all
four tabs stay reachable and none of them wrap or clip. Commerce controls
(Add to Cart, Buy Now) remain real, visible, and honestly disabled —
Cart/Checkout is explicitly out of scope, deferred to UI-02.

**Artist Profile page.** Density reduced (shorter banner, smaller avatar,
tighter spacing) without changing the page's structure; its artwork grid
inherits the same shared `ResponsiveGrid` column behavior as every other
grid in the app.

**AI/AR/commerce visual conventions.** Unchanged and reinforced: AI =
purple (`brand-primary`), AR = blue (`Button variant="info"`), commerce/
primary marketplace actions = gold (`accent-gold`). "Create Account" was
corrected from the purple/AI treatment to gold, since it is a conversion
CTA, not an AI affordance. No AI, AR, checkout, rating, availability, or
count value is ever fabricated anywhere in this pass — every "Coming
soon"/"isn't connected yet" surface says so plainly instead.

**Final automated test/build results (this closing commit).** `tsc -b`:
clean. `oxlint`: clean, 0 errors (pre-existing warnings only, none in any
file this pass touched). Frontend test suite: **793/793 passing across 95
files** (up from 689/689 at the end of Module 13 Phase 4 — 104 new/changed
tests added across this pass's several rounds, none removed). Production
build: succeeds cleanly (only the pre-existing, unrelated >500kB
`fields-*.js` chunk-size advisory). `firestore.rules`/Cloud Functions were
not touched by this pass and were not re-run as part of it (see Module 13
above for their own last-verified counts).

**Not visually verified by the assistant.** No browser or screenshot tool
was available in the assistant's environment throughout this pass — every
round was verified via code inspection, compiled-CSS byte-offset
inspection, and automated tests only. The owner performed the real-browser
visual verification and gave the final approval recorded at the top of
this file.

**Next module: UI-02** (not started — see "Next action" below).

## Module 12 — Artwork Likes (COMPLETE, VERIFIED, COMMITTED)

**Status:** implementation (4 phases), automated tests (592/592 frontend,
185/185 Firestore rules), typecheck, lint, and production build all
clean. Verified via the real `firebase/auth` + `firebase/firestore`
**client SDK** against the real Auth/Firestore dev emulator — not genuine
browser DOM/E2E automation, which this environment has no tool to
perform; see "Verification methodology" below. Owner-reviewed and
approved across all 4 phases, and committed.

### Objective and scope decision

Module 09's own discovery explicitly deferred Likes (and Follows)
because either would require opening a new write exception on an
already-hardened public document (`artworks`), a materially riskier kind
of change than a brand-new private collection. A fresh Module 12
scope-discovery pass re-evaluated the full candidate list and confirmed
Likes as the strongest remaining candidate with no unresolved
owner-provider dependency (no payment/Blaze/AI decision needed) — but the
owner explicitly rejected the first proposed design (an eventually-
consistent counter that knowingly accepted drift) and required a second,
research-backed architecture pass before implementation.

### Architecture (owner-hardened before implementation)

Two designs were compared on correctness, atomicity, privacy, latency,
realtime support, cost, offline behavior, contention, and complexity:
Firestore `count()` aggregation queries (rejected — they require the
underlying collection to be listable, which would have exposed every
liker's identity, the same privacy concern this codebase already
established for auction bidders in `docs/AUCTION_ARCHITECTURE.md`) versus
a denormalized `likeCount` field mutually verified against a private
`likes/{artworkId}/by/{uid}` document ("Option D," approved). The
approved design was hardened once more after the owner identified a real
gap in the first draft: the decrement branch only proved the like
document didn't exist *after* a write, never that it existed *before* —
allowing a "decrement + delete of a nonexistent like" exploit. The final
rule requires symmetric before/after proof in both directions:

```
function isValidLikeCountUpdate(artworkId) {
  return isSignedIn() && resource.data.status == 'PUBLISHED' &&
    request.resource.data.diff(resource.data).affectedKeys().hasOnly(['likeCount']) &&
    (
      (request.resource.data.likeCount == resource.data.likeCount + 1 &&
       !exists(.../likes/$(artworkId)/by/$(request.auth.uid)) &&
       existsAfter(.../likes/$(artworkId)/by/$(request.auth.uid))) ||
      (request.resource.data.likeCount == resource.data.likeCount - 1 &&
       resource.data.likeCount >= 1 &&
       exists(.../likes/$(artworkId)/by/$(request.auth.uid)) &&
       !existsAfter(.../likes/$(artworkId)/by/$(request.auth.uid)))
    );
}
```

paired with a `likes/{artworkId}/by/{uid}` block whose `create`/`delete`
each independently re-verify the matching `likeCount` delta via
`get()`/`getAfter()` on the artwork. `get`/`getAfter` calls stay well
inside Firestore's documented 20-call/10-per-operation ruleset limits (≤3
per create, ≤2 per delete, ≤2 for the artwork branch, thanks to `||`
short-circuiting). `allow list: if false` unconditionally on the `by`
subcollection is what makes liker-identity enumeration impossible even
for an artwork's own liker. UI decisions locked before implementation and
never reopened: sign-in required (no guest mode, unlike Wishlist), Detail
Page only (no card-level Likes yet), a distinct Star icon — never a
second heart — in a "Wishlist | Like | Share" control cluster, and the
real count only, never a fabricated/"1.2K"-style value.

### Phase 1 — Trusted migration

`functions/src/backfillLikeCount.ts` — an Admin-SDK-only operator script
matching the established `promoteSeller.ts`/`publishArtwork.ts`/
`reconcileRoles.ts` pattern (never deployed, never client-reachable,
guarded by `require.main === module`), backfilling `likeCount: 0` onto
every pre-existing artwork missing the field. Dry-run by default,
requires an explicit `--apply`, touches only the `likeCount` field, is
idempotent (a second `--apply` against already-backfilled data is a
verified no-op), and aborts the entire run with zero writes if it finds
any malformed existing value rather than silently "fixing" it. Run
against the real dev emulator's 3 real pre-existing artworks: dry-run
reviewed and approved, then applied and verified via direct read-back
(all 3 now `likeCount: 0`, every other field byte-identical), a second
`--apply` proving idempotency against real data, and an export/import
persistence round-trip through a temporary, disposable emulator instance
(chosen over a literal process restart given this machine's known
Windows signal-delivery risk, disclosed and accepted by the owner).

### Phase 2 — Security rules

The rules above, plus the `likes/{artworkId}/by/{uid}` match block:
`get` owner-only, `list` unconditionally denied, `update` unconditionally
denied, `create`/`delete` each requiring the matching atomic counter
delta. A new 37-test file, `firestore-tests/likes.rules.test.ts`, covers
every success case (CUSTOMER/SELLER like/unlike, re-like, two-users-
concurrent), every adversarial case (signed-out, cross-user
create/delete/get, list/query denial, DRAFT/SUBMITTED/REJECTED denial,
create-alone, increment-alone, delete-alone, decrement-alone, the exact
gap-closing "decrement + nonexistent-like-delete" case, duplicate-like,
wrong-delta increments/decrements, field-integrity violations, mismatched
uid/path/counter combinations), and confirms every existing
seller/owner artwork-update path is unaffected. A transient "maximum of
1000 expressions to evaluate" emulator message during the first run was
investigated rather than assumed — root-caused to a test-helper bug
(`withSecurityRulesDisabled()`'s return type is hard-coded to
`Promise<void>` regardless of the callback's actual return; confirmed via
direct inspection of the package's own type declarations), fixed, and did
not reproduce on the clean re-run. `firestore.rules` was **not** weakened
to make anything pass. Full rules suite: **185/185** (148 existing,
unchanged + 37 new).

### Phase 3 — Client feature

New `src/features/likes/` — `api/likeRepository.ts`
(`likeArtwork`/`unlikeArtwork`, each exactly one `writeBatch()`: create +
increment, or delete + decrement, matching the rules' required shape
precisely; `hasLiked`, a one-shot `getDoc`, never a listener),
`hooks/useLike.ts` (owns its own optimistic-with-rollback state per
mount, no shared provider like Wishlist's — Likes has no guest mode and
is Detail-Page-only, so there's no cross-surface state to share), and
`components/LikeButton.tsx` (a Star-icon pill, deliberately distinct from
`WishlistButton`'s round heart icon; `aria-pressed`; exact accessible
labels "Like this artwork"/"Unlike this artwork"; 44px target; fill
attribute — not color alone — carries state). Signed-out activation
redirects to `/sign-in` reusing `RequireAuth`'s own
`state: { from: location.pathname }` convention, not a new auth flow.
Integrated into `ArtworkDetailPage.tsx`'s existing
Wishlist/Share control row only — no other surface. `Artwork.likeCount`
added to the shared artwork type and defensively mapped in
`mapToArtwork` (missing/malformed/negative → `0`), so every existing
artwork-card consumer stays correct without needing any change itself.

### Phase 4 — Real verification and concurrency hardening

No browser-automation tool exists in this environment (confirmed, not
assumed). Verification instead used the real `firebase/auth` +
`firebase/firestore` **client SDK** — never the Admin SDK — against the
real running dev emulator, signed in as real fresh test accounts,
exercising the exact write/read shapes `likeRepository.ts` implements and
inspecting real Firestore documents before/after. This proves the real
data/security layer end to end (published artwork's real persisted
count; Like/Unlike changing it by exactly ±1; refresh-equivalent reads
surviving via real Firestore state; CUSTOMER and SELLER behaving
identically; SUBMITTED/REJECTED artworks correctly unlikeable; liker-
identity enumeration impossible even via a direct cross-user `get()`) but
does **not** observe the DOM — that gap is disclosed here as a real,
unclosed limitation, not glossed over.

Firing two truly concurrent `likeArtwork()` calls for the same uid+
artwork surfaced a real, 100%-reproducible finding: in isolation (a cold
document, no prior contention) the race resolved correctly every time —
exactly one write commits, one is cleanly denied. Under sustained prior
write activity on the *same* document within the same short window, both
calls' client promises were rejected even though the server had still
only applied the write once (`likeCount` moved by exactly +1 in every
trial, never +2). Root cause: a Firestore-**emulator** JS-SDK
write-stream retry/visibility artifact under contention, not a rules
defect — every server-side invariant held in every trial. The owner
required investigating whether the client could safely recover rather
than accepting the false-failure UX, without ever converting a genuine
denial into a false success. `likeRepository.ts` gained
`getAuthoritativeLikeState(artworkId, uid)` (a defensive re-read of the
real like document + real `likeCount`), and `useLike.ts`'s failure
handler now re-checks ground truth before rolling back: it reconciles to
the authoritative state only when that read *proves* the call's own
desired end state actually happened; any other outcome — including the
reconciliation read itself failing — falls through to the original
rollback + error toast unchanged, so a real authorization failure (signed
out, non-PUBLISHED artwork, tampering) can never be hidden. Cross-tab
`BroadcastChannel`/`localStorage` locking was evaluated and deliberately
not added — reconciliation already covers a strictly broader set of
cases (a second tab, a second device, or a stale cached page) with less
complexity than any same-browser lock could provide.

### Testing

- Firestore rules: **185/185** (148 existing unchanged + 37 new), via
  `npm run test:rules` against the permanent isolated rules-test
  infrastructure — never the dev emulator.
- Full frontend suite: **592/592** across 81 files (up from 554 before
  this module) — new coverage in `likeRepository.test.ts`,
  `useLike.test.tsx`, `LikeButton.test.tsx`, extended
  `artworkRepository.test.ts` (`likeCount` defensive-mapping cases) and
  `ArtworkDetailPage.test.tsx`.
- `tsc --noEmit` clean, `oxlint` clean (0 errors; one new warning at
  `useLike.ts`, the same `set-state-in-effect` pattern already accepted
  at `WishlistProvider.tsx`), production build clean (`ArtworkDetailPage`
  and a new `star` icon chunk, no regressions elsewhere).
- Real client-SDK-against-real-emulator verification (Phase 4, described
  above), including the isolated concurrency reproduction that led to
  the reconciliation hardening.
- Every throwaway Auth-emulator test account created during verification
  was deleted afterward; no real/pre-existing account was touched.

### Known limitations / deliberately deferred

- No genuine browser DOM/E2E automation was performed at any point in
  this module — this environment has no such tool. Everything DOM-level
  (star rendering, disabled styling, real click/keyboard navigation) is
  covered by jsdom component tests only. Real-browser click-through
  remains a future verification item if the owner wants it closed.
- No card-level Likes, no public liker list, no Follows, no Like
  notifications, no ranking/recommendation based on Likes, no cross-tab
  locking — all deliberately out of scope, per approved architecture.
- The underlying emulator write-stream artifact itself is not "fixed"
  (it isn't application code) — it is characterized and safely worked
  around at the client layer.

### Files changed

`firestore.rules` (`isValidLikeCountUpdate`, the `likes/{artworkId}/by/
{uid}` match block); `firestore-tests/likes.rules.test.ts` (new, 37
tests); `functions/src/backfillLikeCount.ts` (new) + `.test.ts` (new);
`functions/package.json` (`backfill-like-count` script);
`src/features/likes/` (new feature — `types.ts`, `api/
likeRepository.ts` + `.test.ts`, `hooks/useLike.ts` + `.test.tsx`,
`components/LikeButton.tsx` + `.test.tsx`, `index.ts`);
`src/features/artwork/types.ts` (`Artwork.likeCount`); `src/features/
artwork/api/artworkRepository.ts` (`mapToArtwork` defensive `likeCount`
mapping) + `.test.ts`; `src/app/routes/ArtworkDetailPage.tsx` (LikeButton
integration) + `.test.tsx`; 6 other artwork test fixture files (mechanical
`likeCount: 0` additions); this file.

**Explicitly not touched:** Wishlist's persistence/merge logic, Share's
behavior, Marketplace/artist-page grids (no card-level Likes), authentication,
Seller Studio, the publish/moderation pipeline, and every seller/owner
artwork-update rule path — verified unchanged by the full, unmodified
regression suite passing alongside the new tests.

## Module 11 — Artwork Detail Page (COMPLETE, VERIFIED — awaiting owner review, not committed)

**Status:** implementation, automated tests (554/554), typecheck, lint, and
production build all clean. Real-browser (Playwright/Chromium) visual and
keyboard/focus verification across 1920/1440/1280/1024/768/430/390/360.
**Not committed — awaiting owner review.**

**Why this module exists:** the Module 11 scope-discovery report identified
that a real visitor discovering a specific artwork could never actually
open it — every artwork card linked only to the seller's whole catalog
page. Every other future commerce/AR/social feature also needs a canonical
single-artwork surface to attach to; this module builds exactly that, and
nothing else.

**Route.** `/artworks/{artworkId}` (`src/app/routes/ArtworkDetailPage.tsx`),
lazy-loaded in `router.tsx` matching every other route's pattern. Public —
works whether or not anyone is signed in.

**Data access.** A new `usePublicArtwork(id)` hook
(`src/features/artwork/hooks/usePublicArtwork.ts`) — a one-shot, cacheable
TanStack Query read, never a listener, matching the same one-shot-per-id
discipline `useWishlistArtworks` already established. It calls a new
`getPublicArtwork` (`src/features/artwork/api/artworkRepository.ts`)
rather than the pre-existing `getArtwork` Wishlist uses: the two need
different error semantics, not different security. `getArtwork` swallows
every failure (including a real network error) into `null`, correct for
resolving many saved-wishlist ids at once where one bad item shouldn't
fail the whole list. A dedicated page a stranger might cold-load needs the
opposite — a genuine network/unavailable failure should surface as a
retryable error, not collapse into the same "not found" state a private or
nonexistent artwork correctly gets. `getPublicArtwork` still maps
`permission-denied` to `null` for exactly the privacy reason `getArtwork`
does. `usePublicArtwork`'s own `select` additionally collapses any
non-`PUBLISHED` artwork to `null` too — even for that artwork's own
owner — so the public route can never render unpublished content to
anyone, regardless of what `firestore.rules` would technically let that
owner read directly (Seller Studio's own `useArtwork`/`subscribeArtwork`
remains the correct path for an owner viewing/editing a non-public
artwork).

**Security — zero `firestore.rules` changes.** The exact property this
page depends on — a signed-out visitor can `getDoc` one `PUBLISHED`
artwork directly; a `DRAFT`/`SUBMITTED`/`REJECTED` one stays unreadable to
anyone but its owner — was already fully proven in
`firestore-tests/artworks.rules.test.ts` since Module 07 (its "PUBLISHED is
publicly readable" and "DRAFT/SUBMITTED/REJECTED stays private" suites
test exactly this, via direct single-document `getDoc`, not just a query).
Rather than pad the suite with a redundant duplicate, the existing 148
rules tests were re-run unchanged via the permanent isolated rules-test
infrastructure and confirmed still 148/148 passing — proving Module 11
introduced no rules regression, without inventing test coverage that
already existed. No genuine rule defect was found, so no rule was touched.

**Image gallery.** A new, reusable `ArtworkGallery`
(`src/features/artwork/components/ArtworkGallery.tsx`) — deliberately a
different presentation from `PublicArtworkCard`'s cropped square thumbnail:
the primary image uses `object-contain` inside a fixed-height frame, so
every real portrait or landscape artwork displays at its true proportions,
never cropped, and switching images never shifts the surrounding page
layout. Images are sorted by their existing `order` field. Thumbnails
render only when more than one image exists; each is a real `<button
role="tab">` (native keyboard focus/activation) with a non-color-only
selected state (a border ring, not just a color shift) and its own
independent broken-image fallback, so one bad thumbnail never breaks the
others. The primary image also supports ArrowLeft/ArrowRight when the
gallery region has focus — verified working in a real browser, not just
asserted in jsdom. No autoplay, no timer, no fake carousel behavior — pure
user-driven state.

**Navigation split (explicit owner decision).** `PublicArtworkCard.tsx` —
previously wrapped externally by each of its four callers in a single
`<Link to="/artists/...">` — now owns its own navigation: the image and
title share one link into `/artworks/{id}` (merged into a single tab stop
rather than two adjacent links to the same destination), and the artist
name (when shown) is a second, separate link into `/artists/{sellerId}`.
`MarketplaceGrid.tsx`, `PublicArtworkGrid.tsx`, `HomePage.tsx`, and
`WishlistPage.tsx` all had their now-redundant outer `<Link>` removed —
each is otherwise unchanged; no query, filter, sort, pagination, or
wishlist-persistence logic was touched. `WishlistButton` (unchanged) still
stops its own click from reaching the new surrounding Link, exactly as it
already did for the old one.

**Sharing.** A new, reusable `ShareButton`
(`src/shared/ui/ShareButton.tsx`) — native Web Share where supported, an
honest `navigator.clipboard` copy-link fallback everywhere else, with a
real toast confirmation ("Link copied to clipboard") or a real error toast
if even that fails. A cancelled native share sheet (`AbortError`) does
nothing, not an error. No share count, like count, or any other engagement
number is ever shown — this is purely an action, never a fabricated
metric.

**Share metadata.** A new, dependency-free `useDocumentMeta`
(`src/shared/hooks/useDocumentMeta.ts`) sets the document title and real
Open Graph/Twitter meta tags (title, description, image) for as long as
the page is mounted, restoring the previous title and removing only the
tags it created on unmount. Deliberately no head-management library was
added — this project has none, and one page's real title/description/image
didn't justify introducing one; flagged here rather than added silently.

**No fabrication, no commerce placeholder.** Per explicit owner
instruction, the page renders no reviews, ratings, purchase history, stock-
urgency copy, delivery estimates, engagement counts, seller statistics, or
recommendations — and no Buy Now/Add to Cart control of any kind, not even
a disabled placeholder (unlike `AIAssistantLauncher`'s own precedent,
which the owner explicitly did *not* want repeated here). Every unit test
suite for this page includes an explicit assertion that none of this
content is ever rendered.

**Premium design / Module 10 inheritance.** Full inheritance of the
Module 10 foundation: `font-display` on the artwork title (the display-serif
role, matching every other H1 in the app), the 90rem shell/`Container`,
`Card`/`Skeleton`/`EmptyState`/`ErrorState`/`Badge`/`Avatar` reused as-is —
no new visual language. At 1920/1440/1280 the page composes as a genuine
two-region layout (a dominant image/gallery column beside a narrower info
column); at 768 it transitions deliberately to a stacked tablet
composition; at 430/390/360 it's a clean single mobile column with no
overflow, no clipped text, and touch targets at the existing 44px standard.
Real-browser screenshots confirmed the artwork itself remains the strongest
visual element at every width, with intelligent proportion retention (not
a desktop layout simply squeezed onto mobile).

**Accessibility.** Real H1 hierarchy (the artwork title). The gallery's
primary image uses the artwork title as meaningful `alt` text (it's primary
content on this page, unlike the card's own deliberately-empty decorative
`alt=""`). Every gallery control is a native, keyboard-operable `<button>`.
Real, visible focus rings confirmed via live Playwright screenshots on the
wishlist button, share button, and gallery thumbnails/arrows — not just
asserted via `aria-pressed`/`aria-selected` in jsdom. WCAG AA contrast
reuses Module 10's already-fixed tokens throughout; no new color was
introduced.

**AI Assistant launcher collision — re-checked, no collision found on this
page.** Real screenshots at 768/430/390/360 (this page's own content shape
— a tall gallery plus a shorter info column — differs from Home's hero+card
combination that Module 10 investigated) show comfortable clearance between
the launcher and the page's last visible content at every width tested.

**Known limitation — a real image-loading timing artifact, not a defect.**
One screenshot (1920px, first run) showed a second thumbnail rendering as a
solid black square; the same artwork's same second thumbnail rendered
correctly (a real second photograph) in every other capture at every other
width. This is consistent with the thumbnail's own deliberate
`loading="lazy"` not having finished by the moment that one screenshot was
taken under this session's ongoing RAM pressure, not a rendering bug —
`ArtworkGallery`'s own `onError` fallback is unit-tested and confirmed
correct, and the same image loaded correctly on every other real-browser
pass.

**Testing.** 554/554 unit/component tests (up from 519 before this
module — 35 new tests across `ArtworkGallery`, `usePublicArtwork`,
`ArtworkDetailPage`, `ShareButton`, `useDocumentMeta`, plus updated
coverage in `PublicArtworkCard`, `MarketplaceGrid`, `PublicArtworkGrid`,
`HomePage`, `WishlistPage`, and a wording-only fix in `WishlistButton`'s
own test to match its new wrapping-Link destination), all passing on the
first clean run after isolating and re-confirming one RAM-contention-only
worker-startup failure (the same established diagnostic protocol from
Module 10 — re-run in isolation, 9/9 passed). `tsc --noEmit` clean,
`oxlint` clean (pre-existing warnings only), production build clean (the
new `ArtworkDetailPage` route code-splits into its own 3.45kB/1.41kB-gzip
chunk, no impact on any other bundle), `git diff --check` clean.

**Files changed:** `src/app/routes/ArtworkDetailPage.tsx` (new) +
`.test.tsx`; `src/features/artwork/components/ArtworkGallery.tsx` (new) +
`.test.tsx`; `src/features/artwork/hooks/usePublicArtwork.ts` (new) +
`.test.tsx`; `src/shared/ui/ShareButton.tsx` (new) + `.test.tsx`;
`src/shared/hooks/useDocumentMeta.ts` (new) + `.test.tsx`;
`src/features/artwork/api/artworkRepository.ts` (added `getPublicArtwork`,
`getArtwork` untouched); `src/features/artwork/components/
PublicArtworkCard.tsx` + `.test.tsx` (navigation split); `src/features/
marketplace/components/MarketplaceGrid.tsx` + `.test.tsx`,
`src/features/artwork/components/PublicArtworkGrid.test.tsx`,
`src/app/routes/HomePage.tsx` + `.test.tsx`, `src/app/routes/
WishlistPage.tsx` + `.test.tsx` (outer Link removed); `src/features/
wishlist/components/WishlistButton.test.tsx` (test-name wording only);
`src/app/routes/router.tsx` (new lazy route); `src/features/artwork/
index.ts`, `src/shared/ui/index.ts` (barrel exports); `docs/DATABASE.md`,
this file.

**Explicitly not touched:** `firestore.rules`, `firestore.indexes.json`,
`storage.rules`, any Cloud Function, Wishlist's persistence/merge logic,
Marketplace's filter/sort/pagination logic, the artist page's own grid data
behavior, authentication, Seller Studio, and the publish/moderation
pipeline — verified by the full, unchanged regression suite passing
alongside the new tests.

## Module 10 — Product UI/UX Foundation (COMPLETE, VERIFIED, COMMITTED — `fffe2a0`)

**Status:** Phase 1 (typography/shell/grid architecture) and Phase 2 (Home
real composition, contrast remediation, responsive completion, visual QA)
both implemented. 519/519 unit/component tests passing, `tsc --noEmit`
clean, `oxlint` clean (only pre-existing warnings, none new), production
build clean, real-browser (Playwright, Chromium) verification across
1920/1440/1280/1024/768/430/390/360 on Home/Explore/Artist/Wishlist/
Sign-in. **Not committed — awaiting owner review.**

**Why this module exists:** an explicit owner audit judged the product as
built through Module 09 to read as a generic Firebase-demo/Tailwind-
dashboard rather than a premium art marketplace — narrow inconsistent
content width, no typographic hierarchy, unfinished-looking sparse grids.
This module is presentation/foundation only: no Firestore schema, security
rule, authentication, business-logic, routing, or query-behavior change
anywhere in either phase.

**Visual direction.** Dark, editorial, restrained — one warm serif display
role layered onto the existing system-sans UI, one desktop content-width
fix, one grid-sizing mechanism fix, measured (not guessed) contrast
correctness. Deliberately not a redesign: every existing token, color, and
component that already worked (Card, Button, EmptyState/ErrorState,
Skeleton, the wishlist/marketplace business logic) was reused as-is.

**Typography system.** A new `--font-display: 'Newsreader', ui-serif,
Georgia, serif` token (`src/index.css`), loaded via a real Google Fonts
`<link>` in `index.html` (`font-display: swap`, so text is never blocked
waiting on the font). Applied via a plain `font-display` Tailwind utility
**only** where a component explicitly assigns the display role: page H1s
(`PageHeader`, Home's hero H1, Sign In/Sign Up H1s), section H2s
(`SectionHeader`), artist-name H1 (`PublicArtistHeader`), and artwork
title/price on `PublicArtworkCard`. Navigation, buttons, forms, body text,
labels, captions, and all other utility UI keep Tailwind's default
system-sans stack untouched, per the owner's explicit "do not overuse the
serif" instruction — this is a two-role type system, not a full-page
serif reskin.

**Shell/container architecture.** `AppShell.tsx`'s sidebar+content row
previously carried `max-w-7xl` (1280px) on the *entire* row (sidebar
included), not a reading column — the actual root cause of large-viewport
pages showing a narrow floating content island in a mostly-empty 1920px/
1440px browser window. Replaced with a new `--max-width-shell: 90rem`
token, consumed as `max-w-[var(--max-width-shell)]` (an arbitrary-value
utility, not a Tailwind theme-namespace key, so its effect never depends on
guessing Tailwind v4's internal max-width scale name) — an explicit,
owner-approved 1440px desktop cap with responsive gutters, not edge-to-edge
at very large viewports. `Container.tsx` (previously defined but unused
anywhere in the real app) was refactored to drop its own padding, since
`AppShell`'s `<main>` already supplies `px-4 sm:px-6 lg:px-8` globally —
double padding would have shrunk the usable content width further. Applied
to Home/Explore/Wishlist/Artist pages; Sign In/Sign Up keep their
pre-existing `max-w-sm` centered-card layout unchanged (a different,
intentionally narrow composition, not an oversight).

**Responsive grid behavior.** `ResponsiveGrid.tsx` changed from fixed
Tailwind breakpoint column counts (2/3/4 at sm/lg/xl, regardless of the
container's real available width) to `sm:grid-cols-[repeat(auto-fill,
minmax(15rem,1fr))]` — column count is now derived from real container
width. This is what makes a 768px tablet container render a genuine 2–3
column layout instead of inheriting whichever hardcoded breakpoint was
nearest, and — critically — what makes a sparse result set (as few as one
artwork) render as a normally-sized card that simply doesn't stretch to
fill the row, rather than either a forced multi-column grid with empty
cells or one card awkwardly stretched to the full container width
(`auto-fill`, deliberately not `auto-fit`, which would collapse the empty
tracks and let the single item's `1fr` stretch to fill the space instead).
Verified with real, temporary Firestore fixtures (Admin SDK, deleted
immediately after screenshotting — see "Testing" below) at 2, 4, and 8
published-artwork counts across 768/1024/1920: 2 and 4 results render as
natural-width, non-stretched, left-starting rows; 8 results render a clean
4-column × 2-row grid at 1920 with no narrow-trapped cards.

**Spacing/alignment fix found via real screenshots.** `MarketplaceGrid.tsx`'s
"Load more" button and "You've reached the end of the marketplace." message
were `justify-center`/`text-center` inside the grid's *full-width* flex
column — harmless at high density, but at low density (1–2 results) this
centered them in the empty space to the right of the sparse grid instead of
under the actual cards, reading as visually disconnected. Changed to
`justify-start`/`text-left` so both elements sit naturally below the grid's
actual content, matching where the cards themselves start. Presentation-only
— no query, pagination, or filter behavior touched.

**Accessibility — WCAG AA contrast audit (the item explicitly flagged as
"still owed" after Phase 1).** A Node script implementing the real W3C
relative-luminance/contrast-ratio formulas (not an estimate) was run
against every actual token-pair combination in `src/index.css`. It found
exactly 3 genuine failures, all now fixed with the smallest change that
resolves each without touching anything that already passed:
1. `--color-text-muted` (`#6b7280`) scored 3.44–4.04:1 against the app's
   three dark surfaces (fails the 4.5:1 normal-text minimum). Changed to
   `#8890a0` — passes at 5.17–6.09:1 across all three, while staying
   visibly less prominent than `--color-text-secondary` so the intended
   3-tier text hierarchy (`primary` > `secondary` > `muted`) is preserved.
2. White button text on `--color-brand-primary` (`#8b5cf6`) scored 4.23:1
   (fails). Darkening the base token would have fixed this but *worsened*
   `--color-brand-primary` used as small text on dark surfaces (a second,
   independently-failing case — see #3) in the opposite direction; the two
   contexts have opposite contrast requirements and cannot share one token
   value. Resolved by leaving `--color-brand-primary` itself untouched and
   having `Button.tsx`'s primary variant reuse the *already-existing*
   `--color-brand-primary-hover` (`#7c3aed`, 5.70:1 — passes) as its
   resting-state background, with hover/active shifting one step further to
   `--color-brand-primary-active` — a non-arbitrary reuse of an existing
   token, not a new color.
3. `--color-brand-primary` used directly as small link/label text on flat
   dark surfaces (not a tinted/translucent background) scored 3.92–4.30:1
   (fails). An exhaustive `grep` for every `text-brand-primary` usage in
   `src` found exactly 4 real instances on a flat surface background:
   `AppBottomNav.tsx`'s active nav label, `SignInPage.tsx`'s "Sign up" link,
   `SignUpPage.tsx`'s "Sign in" link, and `WishlistPage.tsx`'s guest-banner
   "Sign in" link (other matches — `AppSidebar.tsx`, `Avatar.tsx`,
   `Chip.tsx` — sit on a translucent `bg-brand-primary/15`-style tint, not a
   flat surface, and were left alone). A new, separate token,
   `--color-brand-primary-on-dark` (`#9c74f7`, a lightened interpolation
   toward white from the base brand hue — passes at 4.95–5.43:1), was added
   for exactly this text-on-dark-surface use and applied to all 4 instances.
   `--color-brand-primary` itself was never touched, so every existing
   background/tint/icon usage of it is unaffected.
All 6 previously-failing measurements were re-run against the final values
and now pass; nothing that already passed was touched.

**Home page real composition.** Previously a static Card with placeholder
copy ("The full marketplace experience will appear here..."). Now renders
a real "Recently published" section through the *same*
`useMarketplaceArtworks`/`DEFAULT_MARKETPLACE_FILTERS` infrastructure
Explore uses (capped at 8 items via a local `HOME_PREVIEW_COUNT`, so Home
never grows into a second full Marketplace page), with its own
loading/error/empty states — the empty state is honest ("No artworks
published yet... check back soon, or explore the marketplace") rather than
faked, and the current single real artwork is rendered once, never
duplicated to fill space. Hero copy was trimmed of a prior mention of
AI-powered discovery/live auctions/AR previews — features that do not
exist yet — to avoid promising unbuilt functionality.

**Artist and Wishlist page review.** Both already inherit the new shell/
Container/typography/grid system correctly from Phase 1 with no further
change needed — reviewed against the new system and found consistent; no
artist-data logic, wishlist persistence, guest-wishlist behavior, guest→
account merge, or Firestore document structure was touched, per explicit
instruction.

**AI Assistant launcher / card-control collision — investigated, no
regression found requiring a structural fix.** Source review first
suggested no collision was possible (`WishlistButton` sits top-right
*inside* each card; the AI launcher is a `fixed` bottom-right viewport
element). A real-browser screenshot at 390px then showed the launcher
sitting close to/slightly over a card's bottom-right info-panel corner on
Home's very first (unscrolled) viewport when only one short artwork exists
above it. A zoomed crop confirmed this is visual proximity — the launcher
does not actually cover the artist-name/price text, which stays fully
legible — consistent with ordinary floating-action-button behavior used
across the web (a FAB is expected to sit "on top of" whatever content
happens to scroll beneath its fixed position). Two candidate fixes were
evaluated and rejected: adding bottom padding to `<main>` doesn't move
already-visible initial-viewport content, so it wouldn't have changed this
specific screenshot at all, only added unwanted trailing empty space on
every mobile page; no other minimal, non-arbitrary fix was identified. Left
as-is and documented here rather than silently ignored, matching the
explicit "if anything still looks weak, say so instead of hiding it"
instruction. Worth revisiting once the AI Assistant becomes a real,
interactive feature (a real feature's own design would replace this
placeholder anyway) or once more real content naturally pushes the fold
further down.

**Known limitation — sparse real content.** The environment has exactly
one real published artwork. Home/Explore/Artist necessarily show
significant whitespace at large viewports as a result — this is now
*intentional* whitespace (the grid mechanism correctly leaves it unfilled
rather than stretching the one card, and the copy/empty-states are honest
about it) rather than a layout bug, but it will only visually resolve once
more real artworks are published. Multi-card behavior (2/4/8 results) was
verified via temporary, automatically-deleted Firestore fixtures (see
"Testing") specifically so this limitation didn't block verifying the grid
mechanism itself.

**Reusable-component decisions.** No new shared UI primitives were created;
`PageHeader`/`SectionHeader`/`Container`/`ResponsiveGrid`/`Button` were all
extended in place rather than duplicated. `buttonClassName` (the existing
non-`<button>` link-styled-as-button helper) was used for every new
`<Link>`-as-CTA in `HomePage.tsx`, matching the codebase's established
pattern (`WishlistPage.tsx`, `SellerStudioHomePage.tsx`, etc.) rather than
introducing a `Button`-wrapping-`Link` pattern that would nest an `<a>`
inside a `<button>`.

**Performance.** No new runtime dependencies. Newsreader loads via
`font-display: swap` (never blocks text rendering). Home's marketplace
query reuses the existing `useMarketplaceArtworks` TanStack Query cache —
no new listener, no new query shape. Production build: clean, no new
chunk-size regressions (the one pre-existing >500kB chunk warning is
unrelated to this module, unchanged).

**Files changed (both phases):** `index.html`; `src/index.css`;
`src/app/layouts/AppShell.tsx`; `src/app/layouts/AppBottomNav.tsx`;
`src/app/routes/HomePage.tsx` + `HomePage.test.tsx` (rewritten);
`src/app/routes/{ArtistProfilePage,MarketplacePage,WishlistPage,
SignInPage,SignUpPage}.tsx`; `src/app/routes/router.test.tsx` (jsdom
timing fix, see below); `src/features/artist-profile/components/
PublicArtistHeader.tsx`; `src/features/artwork/components/
PublicArtworkCard.tsx`; `src/features/marketplace/components/
MarketplaceGrid.tsx`; `src/shared/ui/{Button,Container,PageHeader,
ResponsiveGrid,SectionHeader}.tsx`.

**A genuine, pre-existing jsdom-only test-timing bug** (unrelated to this
module's own changes, found while adding Phase 1's real lazy-loaded-route
coverage) was root-caused and fixed in `router.test.tsx`: `findByRole`
calls following a real dynamic `import()` occasionally exceeded RTL's
default 1000ms poll window under jsdom specifically — confirmed via a
direct-render bypass (passes instantly) and a real Playwright browser check
(renders instantly, zero console errors) that this never reproduces outside
jsdom. Fixed with an explicit `{ timeout: 3000 }` on the affected
assertions, not a blanket global timeout increase.

**Testing.** 519/519 unit/component tests (`vitest`, reduced worker
concurrency throughout to respect this machine's tight available RAM — see
"Machine resource constraints" below), `tsc --noEmit` clean, `oxlint` clean
(pre-existing warnings only), production build clean. No Firestore/Storage
rules changed, so no rules-test suite needed re-running. Multi-card grid
behavior was verified via a disposable script (Admin SDK, connected to the
existing isolated-safe *dev* emulator with real owner data — not the
permanent isolated rules-test infrastructure, which is Firestore/Storage
*rules* only) that seeded temporary `PUBLISHED` artworks under the real
seller account, screenshotted the resulting grids via Playwright, then
deleted every temporary document in a `finally` block and re-verified the
`artworks` collection count returned to its real baseline (3 documents) —
no temporary data was ever left behind or became seed/demo content.
Real-browser (Playwright/Chromium, headless) screenshots were captured
across Home/Explore/Artist/Wishlist/Sign-in at 1920/1440/1280/1024/768/
430/390/360 and reviewed directly (not source-read) for: dead space,
typographic hierarchy, grid intentionality at 1/2/4/8 results, tablet vs.
stretched-phone feel at 768, mobile overflow/clipping, control legibility,
and any remaining generic-template appearance.

**Machine resource constraints encountered during this module.** This
development machine has 7.67GB total RAM; free memory fluctuated as low as
0.55GB during this module's work (other running applications, not this
project, were the dominant consumer). A leftover orphaned dev-emulator
Firestore process (its parent `firebase emulators:start` CLI had exited
without a clean shutdown, most likely from the same memory pressure) was
found, its live data safely captured via a direct Firestore-emulator REST
export (bypassing the dead Hub coordinator), merged back into
`./emulator-data`, and verified intact via a read-only Admin SDK check
(2 sellers, 3 artworks, 1 wishlist item, 5 auth users — all real,
pre-existing data) before the emulator was restarted through its normal
launcher script. No data was lost. Per standing project practice, every
test run used reduced/serialized concurrency (`--maxWorkers=1` or `=2`)
under memory pressure, and every failure observed under contention was
independently re-run in isolation before being treated as a real
regression rather than assumed. One genuine regression *was* found this
way (not resource contention): `HomePage.test.tsx` still asserted the old
static placeholder copy after Home's real-composition rewrite — rewritten
to cover loading/error/empty/success states against the new real data
flow, `MemoryRouter`-wrapped and mocking `useMarketplaceArtworks`/
`useArtistDisplayNames` exactly like `MarketplaceGrid.test.tsx` already
does, not deleted or weakened.

**Future UI/UX rules future modules must inherit** (do not reinvent):
serif (`font-display`) is reserved for page H1s/section H2s/artwork
titles+prices only; all UI chrome stays system-sans. Desktop content width
is `max-w-[var(--max-width-shell)]` (90rem/1440px), never a raw `max-w-7xl`
or similar hardcoded cap on a sidebar+content row. Any new artwork-card
grid should reuse `ResponsiveGrid` (`auto-fill`/`minmax`, not fixed
breakpoint column counts) rather than a new ad hoc grid. Any new
brand-primary-colored text on a flat dark surface uses
`text-brand-primary-on-dark`, never `text-brand-primary` directly (that
token is reserved for backgrounds/icons/tinted-background text, which
already pass contrast in that context). Any new primary-variant button
reuses `Button`'s existing variant classes rather than hand-rolling
`bg-brand-primary`, which alone fails white-text contrast. New pages with
real but possibly-sparse data must render an honest empty/low-count state
rather than fabricated content, exactly like Home's new section — never
duplicate real content to fill visual space.

## Module 09 — Wishlist (COMPLETE, VERIFIED, COMMITTED — `e573d6d`)

**Status:** implementation, automated tests, and real end-to-end
verification (real browser, real owner account) all complete. Owner review
pending; **not yet committed**.

### Objective and scope decision

Scope discovery (see the Module 08 write-up's own recommendation)
identified Wishlist as the only remaining candidate with zero unmet
dependencies, zero owner-provider decisions, and zero risk to any
already-hardened rule, while still giving real standalone value. Likes and
Follows were both seriously weighed as possible companions and explicitly
rejected from this module's scope: each needs a public, denormalized
counter field on an already-shipped, carefully-locked document
(`artworks.likeCount` / `artists.followerCount`), which means opening a
new write exception on a rule Module 04/06/07 deliberately hardened — a
materially different, higher-risk kind of change than a brand-new private
collection, and one that deserves its own dedicated review rather than
riding along because it's thematically similar. Cart, Checkout, Payments,
Orders, Reviews, Notifications, Auctions, AI, AR, and Admin/Moderation UI
all remain out of scope, matching Module 08's own discovery report.

### What was built

- **`src/features/wishlist/`** (new feature) — `types.ts`; `api/
  wishlistRepository.ts` (`subscribeWishlistIds` — one listener for a
  whole account's wishlist; `addWishlistItem`/`removeWishlistItem`); `api/
  guestWishlistStorage.ts` (a plain `localStorage` id list, wrapped in
  try/catch throughout so a browser that blocks storage degrades to
  "doesn't persist across a refresh," never a crash); `context/
  WishlistProvider.tsx` (the single owner of wishlist state for the whole
  session — guest vs. account mode, optimistic toggle with rollback on
  failure, the guest→account merge); `components/WishlistButton.tsx` (the
  heart toggle); `hooks/useWishlistArtworks.ts` (resolves saved ids to
  live `Artwork` data, one deduplicated one-shot read per id via TanStack
  Query, never a listener per artwork — the same pattern
  `useArtistDisplayNames` established in Module 08).
- **`src/app/routes/WishlistPage.tsx`** — new public route at `/wishlist`
  (deliberately outside `RequireAuth`, since a guest can use it too),
  flipping the nav item pre-scaffolded since Module 02 (`{ id: 'wishlist',
  href: '/wishlist' }`) from `comingSoon` to `available`, and adding
  `'guest'` to its visible audiences.
- **`src/features/artwork/components/PublicArtworkCard.tsx`** — gains an
  unconditional `WishlistButton` overlay (top-right of the image, a
  semi-opaque blurred backdrop so it reads over any artwork's own colors)
  plus a visual/interaction audit pass mandated before touching this
  component: a subtle hover border, a graceful `onError` image fallback,
  and heavier price typography (`font-semibold`) for clearer visual
  hierarchy — all directly serving the "premium marketplace card" bar, not
  scope creep. Imports `WishlistButton` from its concrete file, not the
  `wishlist` barrel, deliberately — importing the barrel here would make
  the `artwork` and `wishlist` feature barrels import each other.
- **`src/features/artwork/api/artworkRepository.ts`** — new one-shot
  `getArtwork(id)` (a `getDoc`, never a subscription), added specifically
  so resolving many saved wishlist items never means opening many
  listeners.
- **`src/main.tsx`** — mounts `WishlistProvider` between `AuthProvider` and
  `RouterProvider`, so its state survives navigating between Marketplace,
  an artist page, and `/wishlist` itself.
- **`firestore.rules`** — one new, self-contained block:
  `wishlists/{uid}/items/{artworkId}` — read/create/delete restricted to
  `isOwner(uid)`, `update` always denied, create field-locked to exactly
  `{ addedAt: request.time }`. Zero lines of any existing rule changed.
- **Bug fix found during the mandated pre-Wishlist visual audit** (real
  screenshots of `/explore` and an artist page, not source-reading alone):
  `MarketplaceFilters`' price-range inputs rendered full-width in the real
  browser, not the intended compact width — a Tailwind class-specificity
  conflict between the shared `Input` component's own `w-full` base class
  and a narrower `className` override, which generated-stylesheet order
  (not JSX class-list order) was silently winning. Fixed by constraining a
  wrapping `<div>` instead of the input itself.
- **`src/index.css`** — added a `prefers-reduced-motion` blanket floor
  (Tailwind's own `motion-safe:`/`motion-reduce:` variants are used
  deliberately in `WishlistButton`'s press feedback; this catches anything
  else, e.g. `Skeleton`'s pre-existing `animate-pulse`, without a separate
  audit of every existing animation).
- **Documentation** — `docs/DATABASE.md` and `docs/SECURITY.md` updated
  with the full schema, the guest/merge semantics, and the security
  reasoning; this file.

### Guest → account UX (the core product decision this module made)

A signed-out visitor's tap on the heart updates instantly (optimistic,
`localStorage`-backed) with a one-time "Saved — sign in to keep your
wishlist across devices" toast (shown once per browser, not on every
save) — never a sign-in wall or a blocking modal. `/wishlist` itself works
signed out, showing whatever is saved locally. The moment that browser
signs in, `WishlistProvider` diffs the local id list against the
already-loaded server set and writes only the ids genuinely missing
(existing server entries are never touched, nothing is ever written
twice); local storage is cleared only once every write has actually
succeeded, so a failed merge leaves nothing lost — it is simply retried
the next time that same account signs in.

### Testing

- Firestore rules (`npm run test:rules`, isolated emulator — see Module
  08's "Final hardening"): **148/148 passing** (135 + 13 new), including
  owner read/create/delete allowed; another signed-in user and a
  signed-out visitor denied on every operation; a forged/incomplete create
  payload denied; `update` denied unconditionally; and the
  guessed-private-artwork-id case (a wishlist entry referencing another
  seller's real `DRAFT` artwork reads fine on its own terms, while the
  referenced artwork itself is still denied, exactly as before).
- Storage rules (isolated emulator): **16/16 passing**, unchanged.
- Full frontend suite: **514/514 passing** across 73 files (up from
  460/67 after Module 08) — new coverage across
  `guestWishlistStorage.test.ts`, `wishlistRepository.test.ts`,
  `WishlistProvider.test.tsx`, `WishlistButton.test.tsx`,
  `useWishlistArtworks.test.tsx`, `WishlistPage.test.tsx`, plus extensions
  to `PublicArtworkCard.test.tsx`, `PublicArtworkGrid.test.tsx`,
  `MarketplaceGrid.test.tsx`, `useNavItems.test.ts`, and `router.test.tsx`.
  Several runs this session showed timeout/worker-startup failures — this
  time traced to a genuine machine-level constraint (as little as 1.15 GB
  free RAM on a 7.67 GB system after a long session of concurrent
  emulator/build/test activity), confirmed by `vitest`'s own "Failed to
  start threads worker" errors (not test-logic failures) hitting a
  different, unrelated set of pre-existing files each time. Resolved by
  freeing memory and reducing test concurrency (`--maxWorkers=2`) for one
  clean run, which passed completely — never a code regression.
- `npm run typecheck`, `npm run build` (`WishlistPage` code-splits into its
  own ~1.8 KB lazy chunk), `npm run lint` (0 errors — 2 new warnings, both
  matching patterns already accepted elsewhere: `WishlistProvider.tsx`
  exports both a component and a hook from one file, exactly like
  `AuthProvider.tsx` already does), and `npm run test:scripts` (68/68, 21
  new — covering `scripts/lib/javaRuntime.mjs`, extracted from
  `start-emulators.mjs` during Module 08 for reuse by the isolated
  test-emulator launcher) all pass.
- `functions` test suite: 37/37, unchanged — no `functions/` source
  touched.
- `git diff --check`: exit 0 — only pre-existing LF/CRLF warnings.

### Real browser verification

Performed against the real owner's account (`bm440946@gmail.com`) and
real `PUBLISHED` artwork ("3d"), plus the existing disposable fixture
account, end to end:

1. Signed out, on `/explore`: the real "3d" card shows an unsaved heart;
   clicking it flips instantly to saved (no network wait visible) with the
   one-time guest-save toast.
2. Refreshing the page: the saved state survives (real `localStorage`
   persistence, not a fabrication).
3. `/wishlist`, still signed out: shows the real saved artwork.
4. Signing in as the real owner: the merge completes automatically; the
   wishlist still shows the artwork immediately after, and the
   signed-out-only "saved on this device" banner correctly disappears.
5. Refreshing again, now signed in: still shows the artwork — this time
   from the real Firestore wishlist, confirmed independently via the
   Admin SDK (`wishlists/{ownerUid}/items/{artworkId}` exists with exactly
   `{ addedAt }`, nothing else).
6. Consistent saved state confirmed on both `/explore` and the artist page
   without re-navigating through `/wishlist` first.
7. A second real account (the disposable fixture seller) signed in and
   visited its own `/wishlist`: shows its own genuine empty state, zero
   leakage of the owner's saved artwork, zero console errors.
8. Responsive: 390px viewport shows no horizontal overflow on either
   `/explore` or `/wishlist`, and the save button's real measured touch
   target is exactly 44×44px.
9. Firestore persistence was verified without a further emulator restart
   (given two earlier restart-related incidents already logged against
   this same session — see Module 08's "Final hardening"): a live export
   via `firebase emulators:export` against the already-running hub was
   inspected directly and confirmed to contain the `wishlists` collection
   data, proving it would survive a restart via the exact same mechanism
   already relied on for every other collection, without actually forcing
   one.

### Known limitations / deliberately deferred

- No Likes, no Follows, no Sharing — see "Objective and scope decision"
  above for why, specifically, rather than "later."
- No cross-tab sync for a signed-out guest's wishlist (each tab reads
  `localStorage` independently; a change in one tab isn't reflected live
  in another already-open tab without a refresh) — not required by the
  approved scope ("survives a refresh"), and out of proportion to add for
  a guest-only, pre-account convenience.
- No global "you have N saved items" indicator in the nav bar itself
  (e.g. a badge count on the Wishlist nav icon) — the count lives on the
  `/wishlist` page itself only.

## Module 08 — Marketplace (Public Artwork Browsing & Search/Filtering) (COMPLETE, VERIFIED, COMMITTED)

**Status:** implementation, automated tests (frontend unit/component,
Firestore rules), and real end-to-end verification via the Firebase Local
Emulator Suite and a real browser (Playwright) all complete. Owner-reviewed
and approved, and committed as `64fbcf5` — this commit also introduced
permanent isolated Firestore/Storage rules-test infrastructure (see its own
"Final hardening" addendum near the end of this section) after an incident,
found during that same review round, where running those suites directly
against the persistent dev emulator wiped its real Auth/Firestore data.

### Objective and scope decision

A fresh scope-discovery pass (not assuming Module 07's own prior ordering
still held) found that Module 07 created real `PUBLISHED` artwork but no
way to discover it except visiting a known artist's URL directly — no
route existed that listed artwork across sellers. Every other pending
candidate (Wishlist/Likes/Follows/Sharing, Cart, Checkout/Payments, Orders,
Auctions, AI, AR, Admin/Moderation UI) was blocked on either an owner
decision not yet made (payment provider, Firebase Blaze billing, an AI
provider) or a new artwork lifecycle state Module 07 deliberately declined
to add. Marketplace had no such blocker: search stays Firestore-native
(already the approved scope in `docs/ARCHITECTURE.md`), and it directly
fixes the discoverability gap Module 07 left behind. The owner approved
this as Module 08, combining "Marketplace" and "Search and filtering" into
one module rather than treating them as separate, since in practice they
are the same page.

### What was built

- **`src/features/marketplace/`** (new feature) — `api/marketplaceRepository.ts`
  (`fetchMarketplacePage`, a one-shot cursor-paginated `getDocs` query, not
  a live subscription), `hooks/useMarketplaceArtworks.ts` (TanStack Query
  `useInfiniteQuery` — the first feature in this codebase read through
  TanStack Query rather than a `subscribeX`/`useX` pair), `hooks/
  useArtistDisplayNames.ts` (`useQueries`, one deduplicated one-shot read
  per distinct seller on the current page), `components/
  MarketplaceFilters.tsx` (category chips, sort chips, price range with an
  explicit Apply/Clear action), `components/MarketplaceGrid.tsx` (results
  grid, loading/error/empty/pagination states), and `types.ts`.
- **`src/app/routes/MarketplacePage.tsx`** — new public route at `/explore`
  (`router.tsx`), deliberately outside `RequireAuth`, matching every other
  public route so far. The pre-scaffolded `marketplace` nav item
  (`src/app/navigation/navItems.ts`, already pointing at `/explore` with
  the label "Explore" since Module 02) is flipped from `comingSoon` to
  `available` — no new nav entry invented, the existing placeholder is
  simply switched on.
- **`src/features/artwork/api/artworkRepository.ts`** — `mapToArtwork` is
  now exported for reuse by the new marketplace repository (same mapping,
  a different query shape); no behavior change.
- **`src/features/artist-profile/api/artistProfileRepository.ts`** — new
  `getArtistDisplayName(uid)`, a one-shot read of the existing public
  `artists/{artistId}` projection, used only by Marketplace cards. No new
  field, no new collection.
- **`src/features/artwork/components/PublicArtworkCard.tsx`** — gains one
  new optional prop, `artistDisplayName`, rendered only when passed;
  Module 06/07's own usage on the artist page never passes it and is
  visually unchanged. Marketplace wraps each card in a `<Link
  to="/artists/{sellerId}">` from the outside, so the card component itself
  needed no new navigation behavior.
- **`firestore.indexes.json`** — 4 new composite indexes on `artworks`
  (previously empty): `(status, createdAt desc)`, `(status, price asc)`,
  `(status, category, createdAt desc)`, `(status, category, price asc)`.
  Each pairs directly with one query shape the UI can actually produce
  (no-category vs. category-filtered, × the newest-sort family vs. the
  price-sort family); the price-ascending indexes also serve
  price-descending via Firestore's own "same index, fully reversed"
  capability, and a `documentId()` tiebreaker orderBy in every query is
  covered by Firestore's automatic implicit trailing index, not listed
  explicitly. See `docs/DATABASE.md`'s "Marketplace query architecture"
  section for the full mapping.
- **No `firestore.rules` change at all** — see "Security decisions" below
  and `docs/SECURITY.md`'s new "Implemented in Module 08" section.
- **Documentation** — `docs/DATABASE.md` (new "Marketplace query
  architecture (Module 08)" section) and `docs/SECURITY.md` (new
  "Implemented in Module 08" section) updated; this file.

### Query architecture, filters/sorts, and pagination

Every query starts with the mandatory `where('status', '==', 'PUBLISHED')`,
optionally adds one `where('category', '==', ...)` equality filter and/or a
`price` range (`>=`/`<=`), and always ends with exactly one primary
`orderBy` (`createdAt desc` for "Newest", or `price asc`/`price desc`) plus
a `documentId()` tiebreaker in the same direction — the tiebreaker is what
makes `startAfter`-based cursor pagination correct even when two artworks
share the same `createdAt`/`price` value. Pagination is real cursor-based
"load more" (`limit(12)` + `startAfter(cursor.primary, cursor.id)`), never
"fetch everything and filter/paginate in the browser." Because Firestore
requires an inequality-filtered field to lead the query's `orderBy`, a
price range cannot be combined with the `createdAt`-based "Newest" sort in
one query; when both are requested together, the repository silently
serves `price-asc` instead (`effectiveSort` in `marketplaceRepository.ts`)
and the UI shows a small note explaining the substitution — a real
Firestore constraint, not an arbitrary product choice.

### Search capabilities and limitations (documented, not silently dropped)

- **Category filtering:** real, Firestore-native, single-select over the
  existing fixed `ARTWORK_CATEGORIES` enum.
- **Price range filtering:** real, Firestore-native (`>=`/`<=` on `price`).
- **Sorting:** real — newest, price ascending, price descending.
- **Tag filtering: deliberately not built.** Unlike `category` (a small,
  closed, hardcoded enum), `tags` are freeform per-artwork strings with no
  "known tags" index anywhere in the schema. Querying one *specific* known
  tag via `array-contains` is technically supported, but *discovering*
  which tags exist to filter by is not, without either inventing a new
  aggregation collection (not justified by any confirmed need yet) or
  scanning every artwork client-side (defeats the point of a server-side
  filter). Left for a later pass if real demand for it appears.
- **Free-text/fuzzy title search: deliberately not built.** A Firestore
  prefix-range trick could serve a case-sensitive "starts with" match, but
  it would force yet another sort/index family for comparatively little
  value over the structured filters above. True full-text/fuzzy search
  needs a dedicated search provider (Algolia/Typesense/etc.), already
  identified and deferred in `docs/ARCHITECTURE.md` pending explicit owner
  approval of a paid service — not something this module should silently
  fake with a misleading substring match.

### Security decisions

No `firestore.rules` line was changed. Firestore evaluates security rules
per-document, never by query shape, so Module 07's existing
`resource.data.status == 'PUBLISHED'` read branch already made *any*
query that can only ever match `PUBLISHED` documents provably safe,
regardless of how many sellers it spans — Module 07's own rule comment
predicted exactly this ("this broader browsing surface is a later module's
job"). A new "cross-seller marketplace query" test suite in
`firestore-tests/artworks.rules.test.ts` proves this rather than merely
asserting it: seeds `PUBLISHED`/`DRAFT`/`SUBMITTED`/`REJECTED` artworks
across two different sellers, then confirms a signed-out visitor and an
authenticated non-owner customer both get back every seller's `PUBLISHED`
artwork and nothing else, that a signed-in seller running the same query
never sees another seller's non-`PUBLISHED` artwork, and that a
structurally unsafe variant of the same query shape
(`status == 'SUBMITTED'`, still no `sellerId`) is rejected by Firestore
outright as un-provable, not merely returned empty.

### Testing

- Firestore rules (`npm run test:rules`, real Firebase Local Emulator
  Suite): 135/135 passing (up from 131 after Module 07) — 4 new tests, all
  in the new "cross-seller marketplace query" suite.
- Full frontend suite (`npx vitest run`): 460/460 passing across 67 test
  files (up from 415/61 after Module 07) — 45 new tests across 7 new files
  (`marketplaceRepository`, `useMarketplaceArtworks`, `useArtistDisplayNames`,
  `MarketplaceFilters`, `MarketplaceGrid`, `MarketplacePage`, plus
  extensions to `PublicArtworkCard.test.tsx`, `artistProfileRepository.test.ts`,
  `useNavItems.test.ts`, and `router.test.tsx`). Two runs under heavy
  concurrent system load (a simultaneous Playwright verification pass, a
  Cloud Functions rebuild, and an emulator restart all running at once)
  each showed a small number of failures confined to timeout-class errors
  in files this module never touched (`router.test.tsx`,
  `AccountHeader.test.tsx`, and, separately, an unrelated
  `storage-tests/artworkImages.rules.test.ts` timeout) — every one of them
  passed cleanly both in isolation and in a full, non-concurrent re-run,
  confirming load-induced flakes, not regressions, matching the exact
  pattern already documented in Module 07.
- `npm run typecheck`, `npm run build` (production build; `MarketplacePage`
  correctly code-splits into its own ~18 KB lazy chunk), `npm run lint` (0
  errors; the only warnings are the same pre-existing patterns already
  present elsewhere in the codebase, none in any Module 08 file), and
  `npm run test:scripts` (47/47, unaffected) all pass.
- `functions` test suite: 37/37 passing, unchanged — no `functions/`
  source was touched by this module.
- `git diff --check`: exit 0 — only pre-existing LF/CRLF `core.autocrlf`
  warnings, no real whitespace errors.

### Real emulator/browser verification (Firebase Local Emulator Suite + real browser)

While preparing this verification, running the Firestore/Storage rules
test suites directly against the already-running (real-data-bearing)
emulator wiped its live Firestore/Auth state — those suites call
`clearFirestore()` in their setup hooks against the same shared
`demo-artvault` project the dev emulator uses, not an isolated copy. This
is exactly the failure mode the project's existing protect/export/restore
protocol exists to prevent, and it was not followed before running those
commands this time. Recovery: the running emulator process tree was
force-killed (`taskkill /T /F`, not a graceful shutdown, so the corrupted
in-memory state was never auto-exported over the good on-disk backup), then
restarted via `npm run emulators` to import the last good on-disk export.
That export predated Module 07's final `PUBLISHED`/`REJECTED`
verification, so both real fixtures had reverted to `DRAFT`; the exact
same trusted-CLI flow Module 07 already used was re-run to restore the
documented state (owner's "3d" re-submitted via real Playwright UI action
and published via `publishArtwork.ts`; the disposable fixture re-submitted
and rejected the same way) before Module 08's own verification began. No
data was fabricated — every account, artwork, and Storage image involved
already existed; this only restored a previously-verified, previously-real
state that a testing mistake had temporarily reverted.

With state restored, verified via a real signed-out Playwright browser
session against `http://localhost:5173/explore`:

1. `/explore` loads and renders with no sign-in required or attempted.
2. The real owner's `PUBLISHED` "3d" artwork appears, with its real
   uploaded Storage image URL rendering, correct title, and correct price
   (₹5000).
3. Four disposable, clearly-labeled cross-seller fixtures (under the
   existing "Persist Restart Gallery" test account, spanning
   sculpture/photography/digital/painting categories and a range of
   prices) appear alongside the owner's artwork, confirming this is a
   genuine cross-seller result set, not accidentally scoped to one seller.
4. The disposable fixture's `REJECTED` artwork ("Persisted Artwork") never
   appears — confirmed by an explicit zero-count check.
5. Selecting the "Sculpture" category chip narrows the visible set to
   exactly the one sculpture fixture, excluding the digital fixture and the
   owner's own (non-sculpture) artwork.
6. Selecting "Price: Low to High" then "Price: High to Low" re-orders the
   five real+fixture cards into the exact expected ascending/descending
   price order (verified by reading the rendered card titles back, not
   just visually).
7. A price range of ₹100–900 narrows the result set to exactly the two
   fixtures actually in that range, and the "a price range is active"
   sort-substitution note appears.
8. Clicking the owner's "3d" card navigates to
   `/artists/ppqIaap00MbYNY9RGDQmTwBb54bP` — the correct, real artist page.
9. With only 5 real+fixture `PUBLISHED` artworks total (page size 12), the
   "You've reached the end of the marketplace." end-of-results state
   renders correctly. A live "Load more" click was **not** exercised in
   the browser — doing so would require manufacturing 12+ artificial
   fixtures purely to cross the page-size boundary, which is
   disproportionate to what it would prove; the cursor-construction and
   `hasNextPage` logic this depends on is already exhaustively covered by
   `marketplaceRepository.test.ts` and `useMarketplaceArtworks.test.tsx`.
10. Zero browser console errors across every check above.

All disposable fixtures created for this verification were deleted
afterward via the Admin SDK; the emulator was left containing only the
same two real/fixture artworks documented in Module 07 (owner's `PUBLISHED`
"3d", fixture's `REJECTED` "Persisted Artwork").

### Follow-up hardening: permanent test/dev emulator isolation

The incident described above (running rules tests directly against the
shared dev emulator) was fixed permanently, not just recovered from once.
`npm run test:rules`/`npm run test:storage-rules` now launch a dedicated,
disposable emulator (`scripts/run-isolated-emulator-tests.mjs`,
`firebase.test.json` — distinct ports `8280`/`9399`, project id
`demo-artvault-test`, no persistence at all) via `firebase emulators:exec`,
and every rules-test file additionally calls a fail-closed runtime guard
(`test-support/emulatorTestEnv.ts`) before its first destructive call,
refusing to run at all unless it can prove it is connected to that isolated
instance and not the dev emulator's known ports. Proven safe with a real
before/after check against the live dev emulator (same owner Auth
uid/email/role claim, `users.role`, `sellers.status`, `artists.displayName`,
`artworks.status`, and Storage image byte sizes, byte-identical before and
after both isolated suites ran) — see docs/DEPLOYMENT.md's "Isolated
rules-test emulator" section for the full architecture. Test results:
135/135 Firestore rules tests, 16/16 Storage rules tests, 68/68
launcher/script tests (21 new, covering the extracted Java-runtime
resolution logic in `scripts/lib/javaRuntime.mjs`) — all against the
isolated instance, all passing.

A second, unrelated incident during this hardening pass is also worth
recording honestly: while verifying the fix, the *dev* emulator's own
Functions-emulator subsystem crashed on its own (an accumulation of failed
reload attempts after repeated manual `tsc` rebuilds during this session,
unrelated to the new test-isolation work, which was independently confirmed
to never touch the dev emulator). The crash lost the in-memory-only
`PUBLISHED`/`REJECTED` correction from the first incident (Auth accounts,
`DRAFT`-state artwork data, and Storage images were untouched, since those
came from the on-disk `./emulator-data` import). Recovered via the same
trusted-CLI flow already used once, then immediately exported to disk
(`firebase emulators:export ./emulator-data --force`, run against the
already-running emulator hub rather than requiring a full restart) so the
corrected state is now durably persisted, not just held in memory.

### Known limitations / deliberately deferred

- No tag-based filter and no free-text/fuzzy title search — see "Search
  capabilities and limitations" above.
- No live "Load more" click was exercised against real browser data (only
  unit/integration-tested) — see point 9 above.
- No new artwork lifecycle state, no Wishlist/Likes/Follows/Sharing, no
  Cart/Checkout/Orders/Payments, no Auctions, no AI/Recommendations, no AR,
  no Admin/Moderation UI — all remain later modules' work, matching the
  scope-discovery report's own recommendation.
- The exact composite index set here (4 indexes) covers only the filter/
  sort combinations Module 08's own UI can produce; a future filter
  dimension (e.g. tags) would need its own new indexes, not a reuse of
  these.

### Final hardening: permanent test/dev emulator isolation

Before commit, running the Firestore/Storage rules test suites directly
against the already-running dev emulator was found to wipe its real
Auth/Firestore data (both suites call `clearFirestore()`/equivalent in
their own setup, and both had hardcoded the dev emulator's own ports and
project id). Fixed permanently: `npm run test:rules`/`test:storage-rules`
now launch a dedicated, disposable emulator (`scripts/
run-isolated-emulator-tests.mjs`, `firebase.test.json` — ports `8280`/
`9399`, project id `demo-artvault-test`, no persistence) via `firebase
emulators:exec`, and every rules-test file additionally calls a
fail-closed runtime guard (`test-support/emulatorTestEnv.ts`) that refuses
to run at all unless it can prove it is connected to that isolated
instance. Proven safe with a real before/after check against the live dev
emulator (Auth uid/email/role claim, `users.role`, `sellers.status`,
`artists.displayName`, `artworks.status`, and Storage image byte sizes,
byte-identical before and after both isolated suites ran). A second,
unrelated incident during this same hardening pass is recorded honestly
too: the dev emulator's own Functions subsystem separately crashed from
accumulated reload instability after repeated manual `tsc` rebuilds during
the session — independently confirmed to have nothing to do with the new
isolated test-emulator work — losing the in-memory-only `PUBLISHED`/
`REJECTED` correction from the first incident (Auth accounts and
`DRAFT`-state artwork data were untouched, since those came from the
on-disk `emulator-data` import). Recovered via the same trusted-CLI flow
already used once, then immediately exported to disk so the corrected
state would not be lost to a third incident.

## Module 07 — Artwork Moderation & Publishing (COMPLETE, VERIFIED, COMMITTED)

**Status:** implementation, automated tests (frontend unit/component,
Firestore rules, Cloud Functions), and real end-to-end verification via the
Firebase Local Emulator Suite and a real browser (Playwright) all complete.
Owner-reviewed and approved, and committed as `a6aa668` (full hash
`a6aa668775ecad86e625ff1458fdbc0fef870c85`, on top of `d917e4f`).

### Objective and scope decision

A scope-discovery pass reviewed every remaining pending feature
(Marketplace, Search, Wishlist/Likes/Follows, Cart/Checkout/Orders,
Payments, Auctions, AI analysis, Recommendations, AR, an Admin Control
Center) and found the same dependency in each: all of them need a genuine
public artwork state that does not yet exist. The owner approved the
narrowest module that removes that blocker: extend the lifecycle by
exactly two states — `PUBLISHED` and `REJECTED` — and build the trusted
mechanism that transitions an artwork into either, without building
Marketplace browsing/search, Wishlist/Likes/Follows/Sharing, Cart/Checkout/
Orders, Payments, Auctions, AI analysis/Recommendations, AR, or any
Admin Control Center UI — all of those remain later modules' work.
`PENDING_REVIEW` was explicitly rejected as a third new state: `SUBMITTED`
already means "awaiting trusted review," so a distinct `PENDING_REVIEW`
without a genuinely separate transition would only duplicate that meaning.
Every commerce/auction/AI/admin lifecycle state
(`AI_PROCESSING`/`AVAILABLE`/`RESERVED`/`IN_AUCTION`/`SOLD`/
`AUCTION_SOLD`/`SUSPENDED`/`CANCELLED`) remains deferred to whichever
future module actually owns its real transition.

### What was built

- **Lifecycle extension** — `src/features/artwork/types.ts`:
  `ARTWORK_STATUSES` becomes `['DRAFT', 'SUBMITTED', 'PUBLISHED',
  'REJECTED']`; `Artwork` gains `reviewedAt: Timestamp | null` and
  `rejectionReason: string | null`, both written only by the trusted
  operator script below. See `docs/DATABASE.md` for the full field
  reference and the permitted-transition table.
- **`functions/src/publishArtwork.ts`** — a new local, Admin-SDK-only,
  never-deployed operator script (same family as `promoteSeller.ts`).
  `decideArtworkByArtworkId(artworkId, decision, options)` re-fetches the
  artwork, throws unless its current `status` is exactly `'SUBMITTED'`
  (rejects invalid transitions; never silently no-ops or overwrites an
  already-decided artwork), then writes only
  `status`/`reviewedAt`/`rejectionReason`/`updatedAt` — every other field
  (`sellerId`, `title`, `price`, `images`, ...) is left untouched. A CLI
  entry point (`npm run publish-artwork -- <artworkId> publish|reject
  [reason]`) is the only way the project owner ever invokes it; there is no
  self-service or in-app path, and no temporary client-side reviewer/admin
  UI was built. 10 new tests in `functions/src/publishArtwork.test.ts`
  cover both transitions, both rejection paths (missing artwork, wrong
  starting status), and confirm untouched fields stay untouched.
- **`firestore.rules`** — one additive `allow read` branch:
  `resource.data.status == 'PUBLISHED'` ORed ahead of the existing
  signed-in-owner branch. No existing `allow update`/`allow delete` branch
  matches a non-`DRAFT` status, so `SUBMITTED → PUBLISHED`/`REJECTED` was
  already structurally client-unreachable before this change — the module
  did not need to add any new denial, only the one new read grant. While
  writing this module's security tests, a real pre-existing gap was found
  in the `DRAFT`-edit `allow update` branch: it validated named fields via
  `isValidArtworkFields()` but never restricted the update to *only* those
  fields via `hasOnly()`, so a client editing a `DRAFT` artwork could have
  smuggled in an unrelated field (e.g. a forged `reviewedAt`) in the same
  write. Fixed by adding the same `diff(...).affectedKeys().hasOnly([...])`
  discipline already used elsewhere in this file. `firestore-tests/
  artworks.rules.test.ts` grew from 113 to 131 passing tests, covering:
  `PUBLISHED` readable by a signed-out visitor/authenticated non-owner/
  owner; `REJECTED` unreadable by anyone but the owner; `DRAFT`/`SUBMITTED`
  regression checks; the field-forgery gap (now closed); and confirmation
  that every Module 04/05 test still passes unchanged.
- **`src/features/artwork/api/artworkRepository.ts`** — `mapToArtwork` now
  parses `reviewedAt`/`rejectionReason` (defaulting to `null`); a new
  `subscribePublishedArtworks(sellerId, onData, onError)` queries
  `sellerId == X && status == 'PUBLISHED'` (two equality filters on
  different fields — no new composite index required) and sorts results
  client-side, mirroring the existing `subscribeArtwork`/
  `subscribeSellerArtworks` pattern exactly.
- **`usePublishedArtworks`, `PublicArtworkCard`, `PublicArtworkGrid`** —
  new read-only components/hook in `src/features/artwork`, deliberately
  separate from the owner-facing `ArtworkListItem`/`ArtworkList` (which
  show Draft/Submitted badges and a Delete action) so no owner-only control
  can ever leak onto a public surface — the same discipline already
  established for `PublicArtistHeader` vs. the seller-facing profile editor
  in Module 06.
- **`src/features/artist-profile/components/PublicArtistArtworks.tsx`** —
  rewritten from a static "no public artworks yet" placeholder to
  `<PublicArtworkGrid sellerId={artistId} />`, wired to the real `artistId`
  from `ArtistProfilePage.tsx`. The honest empty state is preserved for a
  seller with zero `PUBLISHED` artworks — nothing about Module 06's public
  page contract changed except that it now has real data to show.
- **Documentation** — `docs/DATABASE.md` and `docs/SECURITY.md` updated
  with the full four-state lifecycle definition, the permitted-transition
  table, the trusted operator mechanism, the closed field-forgery gap, and
  the deliberately-deferred future states; this file.

### Testing

- `functions`: 37/37 passing (6 test files), including the new 10-test
  `publishArtwork.test.ts`.
- Firestore rules (`npm run test:rules`, real Firebase Local Emulator
  Suite): 131/131 passing (up from 113 before this module), run against a
  throwaway import via the established protect/test/restore cycle — the
  real owner's emulator data was exported, moved aside, verified
  byte-identical after the test run, and restored.
- Full frontend suite (`npx vitest run`): 415/415 passing across 61 test
  files. A first run under simultaneous CPU load from a concurrent
  `functions` test run showed 3 failures confined to
  `src/app/routes/router.test.tsx` (a `findByRole` timeout); that file
  passes 5/5 in isolation, and a clean standalone re-run of the full suite
  passed 415/415 — confirmed a load-induced flake, not a Module 07
  regression.
- `npm run typecheck`, `npm run build` (production build via `tsc -b &&
  vite build`), `npm run lint` (0 errors; only pre-existing warning
  patterns already present elsewhere in the codebase, including one
  instance of the same `set-state-in-effect` pattern already used by
  `useArtwork.ts`/`useSellerArtworks.ts`/`useSellerStatus.ts`), and
  `npm run test:scripts` (47/47, launcher/emulator guard tests — unaffected,
  since this module touched no `scripts/` files) all pass.
- `git diff --check`: exit 0 — only pre-existing LF/CRLF `core.autocrlf`
  warnings, no real whitespace errors.

### Real owner/fixture verification (Firebase Local Emulator Suite + real browser)

Performed against the real owner's own account (`bm440946@gmail.com`) end
to end, never simulated or fabricated:

1. Identified the real owner's existing `DRAFT` artwork ("3d",
   `YwQq21fkz2gWsrirfOsq`) and recorded its fields and both real Storage
   image sizes (840,093 and 1,163,918 bytes) before any transition.
2. Signed in as the real owner via Playwright (real emulator-only
   credentials recovered from the Auth emulator's own export) and clicked
   the real "Submit for review" button in the real Seller Studio UI —
   `DRAFT → SUBMITTED` was a genuine UI action, not a script-based
   Firestore write.
3. Ran the real trusted CLI (`npm run publish-artwork -- YwQq21fkz2gWsrirfOsq
   publish`) to transition `SUBMITTED → PUBLISHED`.
4. Verified via the Admin SDK: `status: 'PUBLISHED'`, `reviewedAt` set,
   `sellerId`/`title`/`price`/`images` all unchanged.
5. Opened `/artists/ppqIaap00MbYNY9RGDQmTwBb54bP` in a fresh, genuinely
   signed-out Playwright browser context: the real artwork title "3d" and
   real price ₹5000 now render, "No public artworks yet" no longer does,
   zero console errors — confirmed both by console assertions and a
   full-page screenshot.
6. Verified persistence across a **real** emulator restart: the emulator
   process was independently restarted (auto-importing from
   `./emulator-data`), and a post-restart Admin SDK check confirmed
   `status: 'PUBLISHED'`, `reviewedAt` still set, and both Storage images
   still present at their exact original byte sizes.

For the `REJECTED` path, the owner's own "3d" artwork was deliberately not
used (per instruction, to avoid destroying the only important owner test
artwork). Instead, a pre-existing disposable emulator test fixture — a
synthetic seller account (`persist-restart-*@example.com`, uid
`IzqUZ7XLlvki9ZlveTbVuw0MpUfn`, created for an earlier module's persistence
testing, not a real user) and its `DRAFT` artwork ("Persisted Artwork") —
was used: submitted for review via the real UI as that fixture seller,
rejected via the real trusted CLI
(`npm run publish-artwork -- lq6fV8aj202AW2u77jn5 reject "Does not meet
quality guidelines"`), confirmed via the Admin SDK
(`status: 'REJECTED'`, `rejectionReason` set, `sellerId`/`title`
unchanged), and confirmed via a fresh signed-out Playwright session that
`/artists/IzqUZ7XLlvki9ZlveTbVuw0MpUfn` still shows "No public artworks
yet" and leaks neither the rejected title nor the rejection reason text.

### Known limitations / deliberately deferred

- No Marketplace browsing/search across all sellers' `PUBLISHED` artworks
  — the only public read path built is the single-seller query the public
  artist page uses.
- No in-app reviewer/admin UI of any kind — the trusted CLI is the only
  mechanism, exactly as scoped.
- No `PUBLISHED → *` or `REJECTED → *` transition (unpublishing,
  re-submitting a rejected artwork) — not needed by anything that exists
  yet.
- Every commerce/auction/AI/admin lifecycle state remains unimplemented,
  deliberately, per the scope decision above.

## Module 06 — Artist Profiles (COMPLETE, owner manually accepted, committed `d917e4f`)

**Status:** implementation, automated tests, real-emulator verification, and
the owner's own full manual acceptance walkthrough (including a real
signed-out/incognito retest after a reported-and-resolved routing
regression — see "Signed-out route regression" below) all complete. Review
result: **PASS — owner manually accepted**. Committed as `d917e4f`.

### Objective and scope decision

No document in this repository ever assigned the literal number "Module
06" to a specific feature — `ARTVAULT_PROJECT_STATE.md`'s own stated policy
is that module selection is an explicit owner decision each time, not a
fixed roadmap. Three independent sources (`docs/ARCHITECTURE.md`'s
feature-folder order, `docs/DATABASE.md`'s draft-collection order, and this
file's own "Pending modules" list) all agreed Artist Profiles was the most
natural next candidate; a scope-discovery report was produced and the
owner explicitly confirmed Artist Profiles as Module 06, at the **medium**
scope: a public artist identity + Seller Studio editing, explicitly
excluding followers/reviews/Marketplace/social feeds/AR/payments/
messaging/analytics — those remain later modules' work.

### Architectural decision: a separate public projection

`artists/{artistId}` is a **physically separate Firestore document** from
`sellers/{uid}` — never the same document opened to public reads.
`artistId` is the same value as the approved seller's own auth uid (no
conflict was found with this choice — it matches the existing
`sellers/{uid}`/`users/{uid}` precedent exactly, so no alternative identity
model was needed). See `docs/DATABASE.md` for the full schema and
`docs/SECURITY.md` for the full rules rationale.

```
uid: string                    == the document id == the approved seller's own auth uid
displayName: string            public display name; 2-80 chars
bio: string                    public bio; 10-500 chars
createdAt: Timestamp (server)
updatedAt: Timestamp (server)
```

Public fields only — `contactEmail`, application `status`, `appliedAt`,
`reviewedAt`, and every other private `sellers/{uid}` field simply do not
exist in this document. No `location` field was added: the existing data
model has no location concept anywhere to draw one from, and inventing one
would have violated "do not invent unnecessary personal information."

### Profile creation and synchronization — never client-triggered

Preserving the Module 04/05 invariant ("never trust the browser to grant
authorization or fabricate identity"), `artists/{uid}` is created only by
two trusted, Admin-SDK-only operator scripts — no new Cloud Function was
needed:

- **`functions/src/promoteSeller.ts`** now also creates the profile at the
  exact moment a seller is approved, seeded from that same application's
  `businessName`/`description`.
- **`functions/src/reconcileRoles.ts`** now also backfills a missing
  profile for any already-APPROVED seller (idempotent — never overwrites
  an existing one, so a seller's own later public-field edits are never at
  risk). This covers a seller approved before this module existed — see
  "Real owner verification" below, where this is exactly what happened.

After creation, the owning approved seller may edit `displayName`/`bio`
themselves directly via a tightly-scoped `firestore.rules` allow-list
(`isOwner(artistId) && hasRole('SELLER')`, matching the Module 04 invariant
that the SELLER claim — never a Firestore mirror — is the sole
authorization signal), the same self-service pattern Module 03 established
for `users/{uid}`.

### Artwork visibility — deliberately not opened

Per the owner's explicit instruction, this module does **not** treat
`SUBMITTED` as a public artwork state. `DRAFT`/`SUBMITTED` remain the only
two lifecycle states that exist, and neither is genuinely public —
`SUBMITTED` means "locked, awaiting a reviewer/Marketplace that doesn't
exist yet." `artworks/{artworkId}`'s rules are completely untouched by this
module. The public artist page always shows an honest "No public artworks
yet" empty state (`PublicArtistArtworks.tsx`) without ever reading
`artworks` at all — a real public artwork lifecycle state and the query/
rule that serves it are the Marketplace/Publishing module's job.

### Security — `firestore.rules`

- `allow read: if true` on `artists/{artistId}` — ArtVault's first
  unauthenticated Firestore read, deliberately isolated to this narrow
  collection (see "Architectural decision" above for why this can never
  leak a private field).
- `allow create: if false` unconditionally — not even the profile's own
  eventual owner can create it; only the two trusted scripts above ever
  do, via the Admin SDK (which bypasses rules entirely).
- `allow update` requires `isOwner(artistId) && hasRole('SELLER')`, an
  unchanged `uid`/`createdAt`, and
  `diff(...).affectedKeys().hasOnly(['displayName', 'bio', 'updatedAt'])` —
  both fields independently length-validated.
- `allow delete: if false`.
- `sellers/{uid}` and `artworks/{artworkId}`'s own rules are completely
  unchanged.

### Dedicated public vs. seller-management components

`src/features/artist-profile/components/PublicArtistHeader.tsx` and
`PublicArtistArtworks.tsx` are read-only and never render any edit/manage
control — verified by a component test asserting no `button`/`textbox`
role exists in their output. `ArtistProfileEditForm.tsx` (Seller Studio
only, rendered from a route already gated by `RequireRole allow={['SELLER']}`)
is a fully separate component tree — no component is shared or prop-toggled
between the public and owner-management surfaces, avoiding the exact
leakage risk the owner's instructions called out.

### Real owner verification

- **Real backfill against pre-existing data:** the real owner account was
  approved as SELLER before this module existed, so it had no
  `artists/{uid}` document at all. Restarting the real emulator after this
  module's code landed ran the updated `reconcile-roles` automatically,
  which logged `ppqIaap00MbYNY9RGDQmTwBb54bP: already-consistent (+ created
  missing artist profile)` — confirmed via the Admin SDK: `displayName:
  "Balamurugan Fine Art"`, `bio` matching the real seller application's
  description, both correctly seeded from the real `sellers/{uid}` record
  with zero manual intervention.
- **Real public page, real signed-out session:** `/artists/ppqIaap00MbYNY9RGDQmTwBb54bP`
  rendered the owner's real display name, real bio, the generated
  initials avatar, and the honest "No public artworks yet" state — in a
  genuinely separate, signed-out browser context (top bar showed
  "Sign in"/"Sign up"), zero console errors.
- **Real nonexistent-artist check:** a fabricated uid correctly showed
  "Artist not found," never an error.
- **Real Seller Studio edit surface:** signed in as the real owner,
  `/seller-studio/profile` correctly pre-filled both fields from the real,
  backfilled profile.
- Auth/Firestore/Storage/Functions emulator health and the owner's
  SELLER/APPROVED status, real artwork, and both real uploaded Storage
  images (from Module 05) were all independently re-confirmed unchanged,
  via the Admin SDK, both before and after this module's rules-test
  protect/restore cycle.

### Signed-out route regression — reported, investigated, resolved

During the owner's first manual pass, a real signed-out/incognito visit to
`/artists/:artistId` was redirected to `/sign-in` instead of showing the
public profile. Investigated before touching any code, per instruction:

- `router.tsx` was re-inspected and confirmed correct — `artists/:artistId`
  is a top-level sibling of `sign-in`/`sign-up`, structurally outside the
  `RequireAuth` subtree, not wrapped by `RequireRole`.
- A repository-wide search for every `/sign-in` redirect found exactly one
  source: `RequireAuth.tsx`'s own `<Navigate>` — nothing in `AppShell`,
  `AuthProvider`, or anywhere else redirects independently of route
  nesting.
- An exhaustive, fresh, isolated-browser-context live re-test (11
  scenarios: signed-out direct URL entry, refresh, and SPA back-navigation;
  authenticated-CUSTOMER direct URL entry and refresh; a fake artist id) all
  **passed** against the current code — the reported redirect could not be
  reproduced.
- **Most likely root cause:** a transient dev-server condition at the exact
  moment of the original test — `createBrowserRouter`'s router object is a
  module-level singleton computed once in `main.tsx`, and Vite HMR has no
  explicit accept boundary registered for `router.tsx` in this project;
  editing it during a live `npm run dev` session can leave an
  already-open tab's in-memory router briefly out of sync with the latest
  route table until a full reload occurs. This is a dev-server-only
  characteristic, not an application code defect — no code change was made
  as a result, since none was needed once the current state was proven
  correct by both the automated re-test and the owner's own subsequent
  retest (PASS).

### Tests

- **Firestore rules:** 113/113 (92 pre-existing + 21 new in
  `firestore-tests/artistProfiles.rules.test.ts`) — public read by a
  signed-out visitor/customer/other seller; nonexistent id and a PENDING
  seller's (nonexistent) profile both fail safely; private `sellers/{uid}`
  fields unreachable; creation blocked for everyone including the eventual
  owner; cross-seller update blocked; protected-field/length-validation
  update failures; delete blocked; and a regression check confirming a
  public visitor still cannot read a SUBMITTED artwork.
- **Storage rules:** 16/16 — unaffected (this module makes no Storage
  changes), re-run as part of the full gate.
- **Functions:** 27/27 (up from 22) — new coverage for
  `promoteSeller.ts`'s artist-profile creation and `reconcileRoles.ts`'s
  backfill (including "never overwrites an existing profile" and "backfill
  happens alongside claim/mirror reconciliation in the same run").
- **Frontend:** 397/397 (up from 361) — repository/hook/component tests for
  the new `artist-profile` feature, plus `ArtistProfilePage`,
  `SellerProfilePage`, and `SellerStudioHomePage`'s new nav link.
- **Build/typecheck/lint:** all clean (pre-existing advisory warnings
  only).

### Known limitations / deferred features

- No avatar upload — deferred per the owner's own explicit instruction to
  avoid destabilizing the core module; the public page uses `Avatar`'s
  existing initials-fallback. A future pass can reuse Module 05's proven
  Storage-rules pattern for it.
- No followers/following, reviews, Marketplace/Search, social feeds, AR,
  payments/orders, messaging, or analytics counters — explicitly out of
  scope per the owner's instructions; each is its own later module.
- No `location` field — the existing data model has no location concept to
  draw one from; not invented for this module.
- No public artwork list yet — see "Artwork visibility" above; activates
  with the Marketplace/Publishing module.
- `router.test.tsx` (the real-router integration suite) was not extended
  to cover the new public route — it currently only exercises routes that
  don't touch Firestore, and the new route's own dedicated page-level test
  (with the feature layer properly mocked) already covers its behavior;
  extending the shared integration file would have required adding
  Firestore mocking that no existing case there needs yet.

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
  result: **PASS — owner manually accepted**. Checkpoint commit: `3265194`.
- **Module 06 — Artist Profiles:** ArtVault's first public-facing feature —
  a public `artists/{artistId}` projection (physically separate from
  `sellers/{uid}`, never exposing any private field), a public
  `/artists/:artistId` page, and a Seller Studio surface for managing the
  public `displayName`/`bio`. The profile is created only by the trusted
  `promoteSeller.ts`/`reconcileRoles.ts` operator scripts, never a client;
  artwork visibility was deliberately not opened (no lifecycle state is
  genuinely public yet). Verified against the real owner account,
  including an automatic real-data backfill via `reconcileRoles.ts` and a
  real signed-out browser session; a reported signed-out-route regression
  was investigated, could not be reproduced against the code via an
  11-scenario live re-test, and the owner's own retest then confirmed
  PASS. Review result: **PASS — owner manually accepted**. Checkpoint
  commit: this closeout's own commit (see `git log`).
- **Module 07 — Artwork Moderation & Publishing:** ArtVault's first genuine
  public artwork lifecycle — two new statuses (`PUBLISHED`, `REJECTED`)
  beyond `DRAFT`/`SUBMITTED`, a trusted Admin-SDK-only operator script
  (`functions/src/publishArtwork.ts`) as the sole `SUBMITTED → *` path, and
  ArtVault's first public read path on `artworks/{artworkId}` itself
  (additive; `DRAFT`/`SUBMITTED`/`REJECTED` stayed exactly as private as
  before). Writing this module's own security tests found and closed a
  real pre-existing field-forgery gap in the `DRAFT`-edit rule. Verified
  against the real owner's own account end to end (real Playwright-driven
  "Submit for review," real trusted-CLI publish, real signed-out
  public-page check, real emulator restart) and against a disposable test
  fixture for the `REJECTED` path. 415/415 unit/component tests, 131/131
  Firestore rules tests, 37/37 Cloud Functions tests. Review result:
  **PASS — owner reviewed and approved**. Checkpoint commit: `a6aa668`
  (docs-accuracy follow-up: `87626d0`).
- **Module 08 — Marketplace (Public Artwork Browsing & Search/Filtering):**
  ArtVault's first cross-seller public discovery surface — a public
  `/explore` route querying every seller's `PUBLISHED` artwork at once,
  with Firestore-native category/price filtering, three sort orders, and
  real cursor-based pagination, requiring zero `firestore.rules` changes
  (proven by a dedicated new rules-test suite, not just argued). Also
  delivered permanent isolated Firestore/Storage rules-test infrastructure
  after discovering, during final pre-commit hardening, that those suites
  had been running directly against the persistent dev emulator and wiping
  its real data. 460/460 unit/component tests, 135/135 Firestore rules
  tests (isolated emulator), 16/16 Storage rules tests (isolated emulator),
  37/37 Cloud Functions tests. Review result: **PASS — owner reviewed and
  approved**. Checkpoint commit: `64fbcf5`.
- **Module 09 — Wishlist:** a save/heart toggle on `PublicArtworkCard`
  (shared by Marketplace and the artist page) and a public `/wishlist`
  page. `wishlists/{uid}/items/{artworkId}` stores only `{ addedAt }` — no
  artwork snapshot. Signed-out visitors save to `localStorage` immediately
  (no sign-in wall, an explicit low-friction UX decision); signing in
  merges local ids into the real Firestore wishlist exactly once, skipping
  ids already present server-side. One shared `WishlistProvider` listener
  for a whole signed-in session — never one per card. Required zero changes
  to any existing rule, proven (not just argued) by a new rules test
  confirming a wishlist entry referencing another seller's private `DRAFT`
  artwork stays itself readable while the referenced artwork does not. A
  real UI/visual audit found and fixed one pre-existing bug: Marketplace's
  price-range inputs rendered full-width due to a Tailwind
  class-specificity conflict. Verified end to end in a real browser
  against the real owner account (guest save → refresh → sign-in merge →
  cross-page consistency → a second real account confirmed unable to see
  it). Review result: **PASS — owner reviewed and approved**. Checkpoint
  commit: `e573d6d`.
- **Module 10 — Product UI/UX Foundation:** a Newsreader display-serif role
  restricted to page H1s/section H2s/artwork titles+prices (never UI
  chrome), a 90rem desktop shell replacing a previous `max-w-7xl` that
  capped the entire sidebar+content row and left large viewports mostly
  empty, a width-driven `ResponsiveGrid` (`auto-fill`/`minmax`) that sizes
  column count from real container width, a real Home-page "Recently
  published" section sourced from live marketplace data (no fabricated
  content, no duplication), and a measured (real W3C formula) WCAG AA
  contrast audit that found and fixed 3 genuine failures without touching
  anything that already passed. Zero Firestore schema/rules changes.
  519/519 unit/component tests, real-browser verification across 8
  required widths. Review result: **PASS — owner reviewed and approved**.
  Checkpoint commit: `fffe2a0`.
- **Module 13 — Admin Control Center:** trusted callable Cloud Functions
  (`approveSellerApplication`, `rejectSellerApplication`,
  `moderateArtwork`) authorized solely via the Firebase Auth `role` custom
  claim, a real `REJECTED` seller-application outcome, the Admin Control
  Center UI itself, and a seller artwork edit lifecycle addition. See
  "Module 13 — Admin Control Center" above for the full write-up. 793/793
  frontend, 243/243 Firestore rules, 146/146 Functions. Review result:
  **PASS — owner approved**. Checkpoint commit: this closeout's own commit
  (see `git log`).
- **UI-01 — Complete Responsive Marketplace UI:** a mobile-first
  responsiveness and navigation-cleanup pass across the whole app —
  corrected artwork-grid/card breakpoints, a 5-item mobile bottom
  navigation, removal of the duplicate Categories page/nav (`/categories`
  now redirects to `/explore`), and mobile density corrections to Home,
  Explore, Artwork Detail, and Artist Profile. See "UI-01 — Complete
  Responsive Marketplace UI" above for the full write-up. 793/793 frontend
  tests. Review result: **PASS — owner approved**. Checkpoint commit: this
  closeout's own commit (see `git log`).

## Pending modules (not started, order not yet committed)

Follows/Sharing, Cart, Checkout/Payments, Orders, Reviews,
Notifications, AI (analysis / assistant / recommendations), Auctions, AR
Engine, Audit Logs, Analytics, hardened Security Rules, Production
Deployment. (Admin Control Center — seller-application review UI and
in-app artwork moderation — is Module 13, complete and committed; likes
specifically are Module 12, complete and committed. Customer
Account & Profile Foundation is Module 03, complete and committed; Seller
Foundation & Artwork Draft Management is Module 04, complete and committed;
Artwork Media/Image Upload is Module 05, complete and committed; Artist
Profiles is Module 06, complete and committed; Artwork Moderation &
Publishing is Module 07, complete and committed; Marketplace (public
browsing/search/filtering) is Module 08, complete and committed; Wishlist
is Module 09, complete and verified, pending owner review — see above. A
tag-based filter and free-text/fuzzy search specifically remain deferred
from Module 08 — see its write-up. Likes and Follows specifically remain
deferred from Module 09, not merely bundled elsewhere — see its write-up
for why they're a meaningfully different kind of change, not just a
same-shaped feature. Followers/following specifically remain deferred from
Module 06 to whichever later module actually builds the Follows feature. A
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
  rule); `sellers/{uid}` and `artworks/{artworkId}` (Module 04);
  `artists/{artistId}` (Module 06, ArtVault's first publicly-readable
  collection) — see `docs/DATABASE.md` for each one's schema and rule.
- **Draft (not yet created):** `carts/{uid}/items`, `orders`,
  `orders/{orderId}/items`, `wishlists/{uid}/items`, `likes/{artworkId}/by`,
  `follows` (bidirectional), `reviews`, `notifications`, `auctions`,
  `auctions/{auctionId}/bids`, `auditLogs`.

## Indexes

None defined yet (`firestore.indexes.json` is an empty skeleton). Every
implemented query so far (`sellers`/`artworks` by `sellerId`, `artists` by
document id) is either a single-field equality or a direct document read,
needing no composite index; Module 06's public artist-page query pattern is
likewise a single document read (`artists/{artistId}`), not a query at all.

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

UI-04 (Auctions Experience) is complete, owner-approved, and committed in
its own closeout commit, on top of UI-03 (Seller Studio, Artwork
Management & Admin Moderation Override), UI-02 (Cart, Checkout, Orders &
Account Experience), UI-01 (Complete Responsive Marketplace UI), and
Module 13 (Admin Control Center, Phases 1-4), all already committed
previously. Not pushed (no remote configured). No UI-05 or any other later
module has been started — next UI selection and scope for UI-05 is an
owner decision. Intentionally deferred by UI-04 (real backend work, not
yet scoped to any module): a trusted real-time bid-placement Cloud
Function, real bid-history/live-bidding data (including the still-
undecided public-vs-private bid projection), and auction finalization
(winner/final-bid recording). Intentionally deferred by UI-02: a payment
provider integration, real order creation/inventory enforcement,
delivery/shipping-rate integration, and a persisted `addresses` collection
for Checkout. Owner still needs to supply the real ArtVault logo asset to
the repository when convenient (not a blocker — a documented temporary
placeholder covers development meanwhile; see `public/brand/README.md`).
