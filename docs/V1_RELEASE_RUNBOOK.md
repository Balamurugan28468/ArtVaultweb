# V1.0 coordinated release and recovery prerequisites

This is a review checklist, **not authorization to execute deployment or restore**.
Module 09 changed no hosted resources. All destructive, billable, payment or
external acceptance operations need the owner's explicit scope and approval.

## Before deployment

1. Review the working tree and [QA report](MODULE09_QA_REPORT.md). Preserve the
   verified source snapshot and existing emulator rollback material.
2. Compare linked project identity to `fqxhjijxgdjfthmfokqk` without displaying
   credentials. Inspect hosted migration history/schema read-only only after
   authorization; do not infer remote state from a local test pass.
3. Reconcile the pre-existing edit to applied migration
   `20261019110000_auction_engine.sql`. Do not repair hosted history blindly or
   assume previously applied SQL will run again. Review pending replacement RPCs.
4. Validate the complete migration chain on a disposable native Supabase/Postgres
   instance with the real supported extensions. Exercise concurrent checkout,
   competing bids, schedule races and expiry/capture locks using separate clients.
   PGlite coverage does not replace this acceptance gate.
5. Review the three pending files, explicit grants/RLS, RPC schemas, unique-index
   preconditions and Cron/Realtime changes. Preflight existing winner-order
   duplicates, address completeness and lot/order relationships read-only.
6. Confirm TEST-only Razorpay server configuration, HMAC webhook configuration,
   manual capture, allowed frontend origins and readiness. No secrets in Vite.
   Production/LIVE payments and UPI/QR remain outside this release.
7. Check Auth SMTP/template/redirect allowlist and six-digit OTP configuration;
   no Auth rewrite or Dashboard change occurred during Module 09.
8. Confirm HTTPS, SPA deep-route fallback, environment validation, browser-safe
   URL/publishable key, private Storage policies and signed-asset delivery.
9. Establish authorized production AR model generation/hosting if production AR
   is required. Development proof flags/endpoints are not a production service.
10. Choose an owner-approved maintenance/release window and rollback threshold.
    Deploy matching frontend/backend versions together; pending RPC contracts
    must exist before enabling their UI to real users.

## Backup and restore gates

- [ ] Confirm available Supabase backup/PITR features and retention in the actual
  project/plan. Do not assume either is enabled or purchase a plan automatically.
- [ ] Take/verify an approved database recovery point **before** schema changes.
  Include app schemas, Auth identities, protected roles, grants/functions/triggers,
  migration history and required extension/cron/publication configuration.
- [ ] Separately inventory and back up private Storage object bytes, ownership,
  MIME/checksums and database object-path associations. A database backup is not
  proof the Storage payload bytes can be restored. Supabase documents this
  separation in its [database backup guide](https://supabase.com/docs/guides/platform/backups).
- [ ] Preserve server-side secret configuration securely using the owner's
  existing secret manager; never copy secrets into Git/docs/chat or browser config.
- [ ] Record baseline counts and invariant summaries without private PII:
  users/profiles/roles, artworks/media, inventory/reservations, orders/payments,
  auction/selection links. Preserve the accepted ₹5,500 TEST evidence/history.
- [ ] Restore into an isolated target first; verify Auth UUID/profile associations,
  object hashes, RLS/cross-account denial, payment references and inventory totals.
- [ ] Keep workers/webhooks disabled or redirected to approved isolated test
  targets during restore rehearsal; prevent duplicate external financial actions.
- [ ] Owner approves any actual restoration/cutback. Never run reset/truncate or
  broad status/inventory rewrites as an application-recovery shortcut.

Source snapshots are **not** database/Auth/Storage backups. The local SQL tests
prove rollback of uncommitted migration DDL, not a safe downgrade after real bids,
orders, chat messages or payments have been written. Prefer a reviewed forward
fix or an explicitly approved, rehearsed restore; stop writes/jobs consistently
if the chosen recovery procedure requires it.

## Pending sequence — not executed

| Order | Migration | Deployment effects to review |
| --- | --- | --- |
| 1 | `20261020153833_auction_e2e_lifecycle.sql` | Winner-order uniqueness/preflight; address/order/payment snapshots; private auction identifiers; sanitized signals; existing `artvault-close-auction-lots` job runs the trusted lifecycle every minute |
| 2 | `20261023142417_weekly_artwork_selection.sql` | Private ranking/review/config; same scheduling gate for single/batch; one weekly event; `artvault-prepare-weekly-selection` every ten minutes; business preparation config remains disabled until admin action |
| 3 | `20261023154024_assistant_recommendations.sql` | Private FAQ/request accounting, owner-only history and verified-user writes, bounded public/personalized recommendation RPC |

Existing reservation expiry remains a separate trusted once-per-minute worker.
Do not add duplicate schedulers. Cron worker EXECUTE remains inaccessible to
ordinary browser roles. New auction signals replace private raw bid/lot/event
publication, preserving unrelated order channels.
Supabase's [Postgres Changes guide](https://supabase.com/docs/guides/realtime/postgres-changes)
describes publication and RLS prerequisites; local publication DDL tests do not
exercise the hosted gateway.

After approval only: linked dry-run must show exactly the reviewed pending
sequence and the expected project. Stop on mismatch/preflight error. No reset,
`--include-all`, hosted reseed, or forced history repair is prescribed here.

## Post-deployment owner smoke plan

Use explicitly approved TEST accounts/fixtures and never genuine user data for
destructive/security testing. Record PASS/FAIL, time, build hash and safe evidence.

1. Guest home/explore/search/filter/artwork/artist and signed images; mobile layout,
   keyboard navigation, deep links, missing/error/retry states and refresh.
2. New approved mailbox: Send OTP, verify six digits, final Create Account,
   temporary-session sign-out, blank sign-in, login/logout/protected routes.
3. CUSTOMER wishlist/like/follow/cart/address refresh/relogin; cross-account IDs
   denied. Creating an order requires separate controlled test authorization.
4. SELLER draft/upload/edit/submit; ADMIN review/publish; verify ownership, status
   locks, signed media and suspension boundaries with approved fixtures.
5. One authorized TEST checkout/payment, only when approved: stored authoritative
   totals, provider ownership/signature/capture, callback/webhook dedupe,
   exactly-once stock consumption, owner history and no real dispatch controls.
6. Expired unpaid fixture: cron releases once and preserves history; PAID and
   CAPTURING/REVIEW remain safe. Observe scheduler records rather than mutate stock.
7. Scheduled auction: observe automatic LIVE and zero-bid close. Two approved
   customers bid; seller/self/late/low/unauthorized bids rejected. Winner creates
   address-complete order; repeated checkout recovers it; loser/guest denied.
8. Inspect Realtime using anonymous/losing/winning accounts: only sanitized
   invalidations, no private winner/order identifiers; reconnect/focus refresh.
9. Admin weekly preparation: inspect eligibility/shortages, approve/reject/refresh,
   audit trail and one event with intended up-to-five lots. Observe job cadence and
   three-day timezone window after an owner-approved schedule configuration.
10. Assistant guest FAQ and private authenticated history; switch accounts, retry,
    ensure no foreign conversations; recommendations exclude drafts/suspended/
    unapproved/out-of-stock records. No fabricated live AI or account lookup.
11. Complete the physical Android checklist in [acceptance](V1_ACCEPTANCE_CHECKLIST.md).
12. Observe server errors, job failures, provider delivery and client console after
    release. If a gate fails, follow the approved recovery threshold; do not hide
    permission errors by broadening RLS or manually settling data.

## Reproducible local checks

Run sequentially on the resource-limited Windows laptop:

```powershell
npm.cmd test -- --run --pool=forks --maxWorkers=1 --fileParallelism=false --testTimeout=30000
npm.cmd run test:supabase
npm.cmd run test:payments
npm.cmd run test:scripts -- --pool=forks --maxWorkers=1 --fileParallelism=false
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
node scripts/qa/browser-smoke.mjs
git diff --check
```

The browser smoke owns its random local server and temporary browser profile;
it never opens Razorpay Checkout or contacts hosted Supabase. It asserts read-only
fixture use and blocks external page requests. Its dummy client is not registered
in ordinary Vite/build configuration. No new dependencies are required.
