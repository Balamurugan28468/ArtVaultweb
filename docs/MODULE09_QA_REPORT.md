# Module 09 — V1.0 integration QA

Date: 2026-10-24. Branch: `supabase-full-cutover`. Starting HEAD: `131b684`.
Scope: stabilize the existing nine-module V1.0; no roadmap expansion, deployment,
hosted mutations, commits or pushes. Attached design sheets are reference material,
not acceptance evidence or authorization to add their original roadmap features.

## Preservation and audit

The previous 550-file snapshot preceded six final AR edits. A fresh **552-file**
source snapshot was copied and SHA-256 verified at
`../artvault-source-backups/module09-finalization-20261024-105122`.
It includes eligible tracked and untracked source, but excludes credentials,
dependencies, build outputs, emulator data and local browser state. Its manifest
records each source path/hash. `.env.local`, `ar-physical-test-audit.txt` and
`ar-selection.json` remain ignored. The unrelated `README_apply.txt` was untouched.

The source review covered routing/guards, Auth/profile/role provisioning, buyer
order queries, signed images, cart/address/checkout boundaries, seller fulfillment,
admin/selection integration, auction Realtime, assistant/recommendation privacy,
AR authorization/lifecycle and the complete pending migration sequence. Existing
module implementations and their meaningful tests were preserved.

### Task ledger

| Work item | Local result | Hosted action |
| --- | --- | --- |
| Preserve the dirty worktree and applied-migration drift | PASS — no reset, restore, clean, deletion, commit or push; no staged paths | None performed |
| Revalidate the source snapshot | PASS — 552 declared files, 552 SHA-256 hashes checked, zero mismatches on 2026-10-24 | This is source recovery only, not a database or Storage backup |
| Payment, reservation and auction lifecycle review | PASS for the isolated cases listed below; no provider call was made | Real webhook/provider, cron and concurrent-connection behavior remains unverified |
| Pending migration / RPC contract review | PASS in the isolated fixture, including transactional apply/rollback/reapply | Do not apply locally linked or remotely without the approval-stage plan |
| Browser and responsive smoke | PASS with a read-only local fixture only | Real Auth, Storage, Realtime and payment flows remain blocked for hosted acceptance |
| Secret, Firebase and unsafe-render static indicators | No active Firebase runtime imports, `dangerouslySetInnerHTML`, or `eval`; secret-name matches were limited to expected handler/config/test paths and were not printed | No secret value was read, rotated, committed or deployed |

## Confirmed defects

| ID | Severity | Reproduction and root cause | Minimal fix and regression |
| --- | --- | --- | --- |
| QA-01 | Medium | Open an authorized order/history when one snapshotted Storage object is missing/revoked or its signer fails. `readItems` rejects `Promise.all`, hiding readable purchase details. | Catch only each thumbnail signing failure and render the existing null-image fallback. Preserve title, quantity, immutable totals and successful thumbnails. Two repository regressions cover items and order previews. Database read failures still propagate; no unsigned URL fallback. |
| QA-02 | Medium | Miss an auction notification during disconnect/backgrounding; reconnect without a subsequent bid. Hooks have no subscribed/focus refresh, leaving stale status or winner/payment-window UI. | Re-read the existing authorized RPC on `SUBSCRIBED` and window focus. Remove focus listeners on cleanup; ignore late reconnect/signal callbacks from a replaced effect even after another route reactivates the hook. Three regressions cover catalog/lot recovery, unmount and stale-channel navigation. No raw bid payloads or private identifiers are used. |
| QA-03 | Test safety | An incomplete unit mock could otherwise call the real HTTP/WebSocket implementations. Existing setup enforced DOM cleanup only. | Default fetch/socket guards fail before networking; tests must explicitly mock boundaries. Two regressions prove rejection. No production behavior changed. |

No new database migration was necessary. No Auth algorithm, payment authority,
inventory mutation, AR engine or auction/selection ranking rules changed.

## Migration and contract verification

The existing isolated PGlite fixture applies all migrations in filename order.
It now additionally exercises each pending migration inside a transaction,
rolls it back, compares catalog counts (relations/functions/policies/triggers/
constraints), cron definitions and Realtime publication entries, then applies
the original complete migration normally. Three explicit tests record this.

A TypeScript-AST scan finds static `rpc(...)`/`.rpc(...)` calls throughout active
frontend source and checks function names, argument names and required/default
parameters against the installed `pg_proc` catalog. Existing feature repository
schema/mapping tests and SQL business tests cover result contracts; the AST scan
alone does not prove arbitrary JSON return shapes or dynamic RPC dispatch.

The three pending files remain byte-for-byte unchanged from the initial snapshot:

1. `20261020153833_auction_e2e_lifecycle.sql`: activation/closure, winner checkout,
   idempotency/address/payment compatibility and sanitized Realtime.
2. `20261023142417_weekly_artwork_selection.sql`: private eligibility/ranking/
   versioned review, default-disabled weekly preparation, atomic multi-lot schedule.
3. `20261023154024_assistant_recommendations.sql`: private FAQ conversations and
   request quotas, authorized history, eligible heuristic recommendations.

**Limits:** PGlite runs PostgreSQL SQL/RLS but cannot load native `pg_cron` workers
or provide the Supabase gateway. Cron registration is stubbed; real worker/RPC
bodies and publication DDL are exercised. Docker CLI is installed but its daemon
was unavailable; no native `psql` executable was found. No native Supabase stack
or simultaneous multi-connection contention test was performed. Transactional
rollback is not a downgrade of already committed business/schema changes.

The prior working tree already contains a 12-line conflict check in the older
`20261019110000_auction_engine.sql`; this continuation preserved it. Deployment
review must reconcile that applied-file drift rather than assume the CLI replays
old history. The pending Module 06 wrapper independently revalidates conflicts
behind the shared scheduling lock; no new hosted history edits were made here.

### Pending migration dependency and risk table

| Pending migration | Dependencies and local evidence | Risk / release control |
| --- | --- | --- |
| `20261020153833_auction_e2e_lifecycle.sql` | Depends on the existing auction engine, order/reservation/payment transitions, and sanitized auction signal model. Isolated lifecycle, privacy, winner checkout, exactly-once settlement, expiry/CAPTURING/REVIEW and rollback/reapply tests pass. It replaces the command of the existing `artvault-close-auction-lots` job with `private.run_auction_lifecycle(50)`; it does not create a competing same-name job. | **High.** A cron command changes live state every minute. Take a recovery point, inspect the actual linked job/history, run the exact migration chain in staging, then verify activation/close/expiry with trusted TEST settlement. The local edited already-applied auction migration requires separate reconciliation. |
| `20261023142417_weekly_artwork_selection.sql` | Depends on published/seller/inventory/media/auction eligibility, Module 05 scheduling, private scoring tables and advisory-lock scheduling. Deterministic eligibility, fairness, stale-fingerprint, atomic multi-lot and Kolkata three-calendar-day tests pass. Configuration defaults disabled; its separate `artvault-prepare-weekly-selection` job does not replace lifecycle/expiry jobs. | **High.** `candidate_limit` is currently checked against **all** `public.artworks` before eligibility filtering (`count(*) > limit`), then all rows are iterated. This is fail-closed and observable, but can block an otherwise small eligible pool and does not scale past the configured cap. Capacity-plan/count all rows before enabling, use the default-disabled configuration until reviewed, and profile/index a future forward-only optimization rather than editing applied history. |
| `20261023154024_assistant_recommendations.sql` | Depends on Auth/profile status, private assistant data, public artwork eligibility and existing recommendation metadata. Isolated tests cover verified/active identity, ownership, hidden SYSTEM messages, quotas, idempotency/body hash, credential/input checks, bounded pagination, seller diversity and rollback/reapply. | **Moderate–high.** It adds private records and SECURITY DEFINER/RPC boundaries. Review grants and behavior under the real Auth JWT gateway, verify quotas under simultaneous requests, and confirm no FAQ/request data becomes public before enabling user traffic. The feature remains FAQ/heuristic based; no LLM or vision provider was found. |

## Security and integration findings

- Supabase Auth remains credential authority; protected role records/RLS remain
  authoritative. No browser metadata promotion, password/profile comparison or
  credential persistence was added.
- Unit network isolation is enforced. SQL tests use only in-memory fixtures.
  Browser QA uses an alternate client module on its dedicated local Vite server;
  ordinary production configuration never imports this fixture.
- Browser fixture mutations are denied; external browser requests are intercepted
  before navigation. The only blocked external origin observed was Google Fonts.
- SQL tests cover buyer/cross-buyer, seller/cross-seller, admin and anonymous access,
  service-only payment RPCs, exactly-once inventory, expiry/capture protection,
  private auction winner/order identifiers, assistant ownership and recommendation
  eligibility. Passing these tests is evidence for tested cases, not a security
  certification or a substitute for hosted policy comparison.
- No active Firebase SDK imports, `@/lib/firebase` imports or `FirebaseError`
  references were found in `src`. Historical comments/tooling remain outside this
  cleanup scope. No `dangerouslySetInnerHTML` or `eval` use was found in `src`.
- Missing order thumbnails degrade safely; protected Storage remains private.
  Signed URLs are short-lived. Long-open pages still need hosted acceptance for
  expiry/refresh behavior under the real Storage service.
- No new dependency, provider, shipping API, refund/restock shortcut or LIVE payment
  capability was introduced. No order, payment, inventory or reservation was created.

## Browser verification

Run `node scripts/qa/browser-smoke.mjs` from the project root. It starts its own
random-port loopback Vite server with `envDir: false`, fixed dummy browser config,
and the explicit read-only Supabase fixture. It launches installed Chrome/Edge in
a temporary profile and closes only those owned resources. It does not reuse the
owner's port-5173 server/session or load `.env.local`.

Actual React routes, providers, repositories, lazy chunks and CSS are exercised in
Edge `155.0.4283.62`. The saved ignored `module09-browser-results.log` records
**25 route/action checks and four width assertions**, plus the 320-pixel address
modal action geometry check, with zero uncaught runtime
exceptions and zero allowed hosted requests:

- Guest marketplace/artwork/artist/recommendation/auction/AR-fallback routes.
- Guest checkout redirects to blank sign-in; signup shows six disabled OTP inputs.
- Guest assistant returns the existing canonical FAQ response.
- Buyer own fixture order history/details and denied admin navigation.
- Buyer fixture cart/checkout with a complete default address: the unpaid-order
  action enables, and the address modal's form-linked save action is visible and
  accessible at 320 pixels. The order/payment action is never clicked.
- Seller Studio incoming-orders section and denied admin navigation.
- ADMIN/SUPER_ADMIN Control Center and auction/weekly-selection review integration.
- Marketplace at 320, 390, 768 and 1440 pixels, no horizontal document overflow.

This is **fixture UI integration**, not real OTP delivery, provider checkout,
network Realtime, production roles/RLS, camera AR or comprehensive visual/accessibility
certification. Fixture payment state is display data, never a fabricated provider
transaction. SQL tests separately verify actual data authorization.
The harness detects installed Chrome/Edge, waits for document readiness and
handles CDP interception IDs invalidated by route navigation. Early harness setup
attempts were corrected before the final passing run; no production behavior was
changed to satisfy a fixture error.

## Verification results

Final full-run totals are recorded below. Ignored `module09-*.log`
files contain the machine-local command evidence; they are not deployment artifacts.

| Check | Result |
| --- | --- |
| Targeted image + auction recovery | 43 passed / 3 files |
| Broader orders/payments/auctions + network isolation | 157 passed / 21 files |
| Final stale-channel route regression group | 9 passed / 1 file |
| SQL/RLS + migration/RPC contracts | 162 passed; zero failed/skipped/cancelled |
| Browser fixture smoke | 25 route/action checks + 4 marketplace widths + mobile address action passed |
| Typecheck | PASS |
| Lint | PASS, 0 errors / 66 pre-existing warnings |
| Full frontend | 1,720 passed / 180 files; zero failed/skipped |
| Payment handler | 36 passed / 1 file; zero failed/skipped |
| Scripts/AR/provider | 46 passed / 3 files; zero failed/skipped |
| Production build | PASS, 3.05 seconds |
| Diff whitespace / source preservation | PASS; 85 protected baseline files unchanged, including Auth/AR/payment/checkout/migrations |

The existing jsdom `scrollTo` notices are test-environment warnings, not a failed
browser navigation test. Performance review confirms route-level lazy loading and
AR engine loading only at the AR boundary. This does not establish device FPS,
Core Web Vitals, thermal behavior or sustained-load performance.

The first production build reported entry JavaScript 287.09 kB (87.23 kB gzip),
the Supabase client chunk 215.39 kB (55.35 kB gzip), Admin route 114.73 kB
(24.54 kB gzip) and CSS 83.23 kB (13.41 kB gzip). These are build observations,
not measured navigation latency or a claim every chunk loads at startup. AR's
development-only proof path is deliberately absent from production delivery.
Buyer history still fans out to related records per order; larger-history
pagination/query performance requires profiling beyond the small demo dataset.

Final frontend execution took 605.12 seconds with one fork worker. The four final
automated suites total **1,964 passing tests**, with zero failures/skips. Focused
runs overlap that total and are not counted again. No tests were removed.

## Files changed in this continuation

Created:

```text
docs/MODULE09_QA_REPORT.md
docs/V1_ACCEPTANCE_CHECKLIST.md
docs/V1_RELEASE_RUNBOOK.md
scripts/qa/browser-smoke.mjs
scripts/qa/supabase-fixture.mjs
src/test/networkIsolation.test.ts
supabase/tests/module09-contracts.mjs
```

Modified, relative to the 552-file initial snapshot:

```text
ARTVAULT_PROJECT_STATE.md
src/features/auctions/hooks/useAuction.ts
src/features/auctions/hooks/useAuction.test.ts
src/features/auctions/hooks/useAuctions.ts
src/features/auctions/hooks/useAuctions.test.ts
src/features/orders/api/orderRepository.ts
src/features/orders/api/orderRepository.test.ts
src/test/setup.ts
supabase/tests/foundation.test.mjs
```

All other existing uncommitted Auth/Modules 05–08 work remains present. No files
were staged, deleted, restored or committed. Machine-local logs are Git-ignored.

## Readiness conclusion

| Release gate | Status | Direct evidence / limit |
| --- | --- | --- |
| Local code and automated tests | PASS | Focused, full frontend, SQL/RLS, payment, scripts, typecheck, lint, build and fixture-browser evidence listed above. |
| Database migration correctness | PASS (local fixture) | Each pending migration applied, rolled back and reapplied; business/RLS tests pass. Native extension and production data compatibility are outside PGlite. |
| Hosted database compatibility | NOT VERIFIED | No linked-project read/write, migration history query or native staging chain was authorized in this continuation. |
| Auth / RLS / Storage / Realtime integration | NOT VERIFIED | Local SQL/RLS and fixture UI evidence pass; no hosted Auth, Storage signing, Realtime gateway or policy acceptance was run. |
| Auction cron and lifecycle | NOT VERIFIED | Isolated lifecycle and cron-definition tests pass; live scheduler cadence, job history and real contention were not exercised. |
| Razorpay TEST integration | NOT VERIFIED | Handler and state-machine tests pass; no TEST order, capture, webhook or external provider request was made. |
| Physical-device AR | BLOCKED | Browser fallback/lifecycle code is covered, but no compatible Android/WebXR physical device, HTTPS deployment or production model delivery was tested. |
| Backup and recovery | NOT VERIFIED | The 552-file source backup is verified; no genuine hosted database/Auth/Storage backup or restore rehearsal was inspected. |
| Deployment and rollback | BLOCKED | An approval-gated backup, native staging, migration and monitored rollout are still required. |

Local QA is distinct from production acceptance. Pending migrations block hosted
Module 05/06/07 acceptance; production AR asset delivery and physical Android
validation remain open. Existing owner-verified Auth and Razorpay TEST evidence is
preserved historical acceptance, not a new hosted test in this continuation.
See [V1 acceptance checklist](V1_ACCEPTANCE_CHECKLIST.md) and
[release/restore runbook](V1_RELEASE_RUNBOOK.md) for explicit remaining gates.

Hosted changes: **NONE**. Git commits/pushes: **NONE**.
