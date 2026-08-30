# ArtVault — Project State

_Last updated: 2026-08-30 — Module 02 (Design System & Navigation):
**COMPLETE, owner-approved, and committed** (`77cee05`). Desktop approved
as-is; mobile went through two corrective passes (presentation polish,
then a layout/collision fix, then a route-scroll-reset fix) after the
owner's own manual review at ~302×531 across three rounds. Final owner
visual review in real Chrome DevTools confirmed all previously reported
defects resolved. Module 01 remains complete and committed._

## Project version

`0.0.0` (unreleased, foundation stage — no deployed environment exists yet).

## Current module

None in progress. Module 02 is complete and committed; Module 03 has not
been started.

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

- **Root (`npm run test -- --run`):** 16 files, 42 tests, all passing
  (up from 11/31 — Module 02 added `useNavItems`, `Modal`, `Drawer`,
  `AIAssistantLauncher`, `ViewInArBadge` tests, plus a `router.test.tsx`
  fix for the now-intentional duplicate "Sign in" entry between the top
  bar and mobile bottom nav).
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

Module 02 (Design System & Navigation) is implemented, independently
reviewed, and real-browser verified — awaiting owner review before
commit. Owner still needs to supply the real ArtVault logo asset to the
repository when convenient (not a blocker — a documented temporary
placeholder covers development meanwhile; see `public/brand/README.md`).
