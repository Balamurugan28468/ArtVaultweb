# Full Supabase migration checkpoint

2026-09-19 IST. Incomplete; not ready for owner end-to-end testing.

## Owner Auth verification and protected role bootstrap

The owner confirmed both real accounts completed the corrected recovery/password
flow, with Site URL localhost:5173 and callback /auth/callback. The Auth gate is
passed by owner verification; earlier pending statements below are historical.

Hosted schema was rechecked: all three foundation migrations, 35 RLS-enabled
tables, 45 policies and both private buckets remain present. The approved
`operators/bootstrap-owner-roles.sql` was executed through authenticated CLI SQL.
Readback verified the seller identity `0d649039-ec68-4d12-8b79-8000241febdc`
has SELLER, and separate administrator `e28bce5a-8400-43e9-8a12-6953cb93daf9`
has SUPER_ADMIN. Two bootstrap audit rows exist. Authenticated browser roles have
no UPDATE privilege on private.user_roles. No browser metadata was changed.
The seller's legacy UID is `ppqIaap00MbYNY9RGDQmTwBb54bP`; preserve this mapping
when migrating the 12 artworks, never assign them to the administrator.

Hosted artworks and Storage objects still number zero. Data import and runtime
cutover have not occurred. The local server-side Storage credential is absent;
owner-only configuration of SUPABASE_SECRET_KEY in ignored .env.local was
requested for trusted migration tools. It must never use a VITE_ prefix, appear
in output, or be committed. Prior automatic review rejected CLI secret-key
retrieval; that operation has not been retried or bypassed. Firebase source and
emulator data remain intact. No commit or push was performed.

## Auth callback correction checkpoint

Supabase invitation testing exposed the default localhost:3000 redirect and
missing SPA completion flow. `/auth/callback` and `/auth/recovery` now handle
Supabase sessions/password setup independently of the Firebase providers.
See `SUPABASE_AUTH_SETUP.md` for the exact localhost:5173 Dashboard settings.
Hosted read-only checks now find both approved Auth identities, each with a
confirmation timestamp and nonempty password field; this supersedes the earlier
zero-identity checkpoint below but does not prove owner password/login success.
37 targeted tests pass; typecheck, lint, build and diff check pass with existing
warnings. Vite returns HTTP 200 for both routes. Real email-link acceptance,
password change and subsequent login remain owner-browser verification pending.
No secret was accessed and no protected role or Firebase record was changed.
The full backend migration stays paused at this Auth verification gate.

## Preservation

The starting tree contained 100 modified/untracked files at HEAD 6f5ff05.
Verified copies, hashes and a Git binary patch are saved outside the repository
in `../migration-safety/2026-09-18T18-08-00-336Z/`. Ignored environment credentials
were excluded. Firebase source, exports, AR, commerce and UI remain unchanged.
No commit, push, reset, restore, emulator restart or data deletion occurred.

## Hosted foundation

Project: `fqxhjijxgdjfthmfokqk`, ACTIVE_HEALTHY, PostgreSQL 17.
CLI login provides Management API access without printing credentials.
Before deployment: no application relations, policies, buckets or Auth users.
The existing public `rls_auto_enable` event-trigger helper was inspected and
preserved; it enables RLS on newly created public tables.

Applied using the CLI migration workflow (no seeds or Vault updates):

- 20260919000100_foundation.sql
- 20260919000200_roles_and_rls.sql
- 20260919000300_storage.sql

Remote verification: 33 public and two private tables, all RLS enabled;
45 policies; 208 constraints; 131 indexes; 35 application timestamp triggers;
one Auth signup trigger; protected role helpers and seller summary function;
private artwork-images and ar-assets buckets. Migration history contains all
three versions. Auth users, profiles, artworks and Storage objects remain zero.
Authenticated clients have no table-level UPDATE on private roles, inventory
or orders, and no INSERT on orders. Hosted cross-account end-to-end tests remain
pending; these catalog checks are not a substitute for them.

Local SQL/security tests rerun before deployment: 45 passed, zero failed/skipped.
No application-code changes were made, and frontend/build suites were not rerun
for this checkpoint. Their previous results are not fresh migration verification.

## Source identity blocker

Firebase configuration names demo-artvault. Both inspected recent complete
snapshots contain 13 Auth users, seven user documents, two sellers, 17 artworks,
one PUBLISHED artwork and zero orders/reservations. Every Auth account has an
emulator fake password hash. No hash value or credential was printed.

The current pointer references:
`1789744105949-shutdown-91960794-955f-47db-95ec-f0e07f666325`, generation
`96c80c2232fd34acc521bc9a8a5ead39a77f7f9fd125d9a8b1dfcfcc9aa49cf3`.
The newer checkpoint is:
`1789744778072-checkpoint-3c9069e2-e504-497d-a4d9-269e24c9b857`, generation
`0ad3fb1312214ce55fdfb93633a10f55447007ebd11e1d55bdd3ed057a23cdc9`.
Their counts match but generations differ. No migration source has been silently
selected. Live read-only emulator diagnosis returned `fetch failed`; no live
counts or latest-state guarantee can be claimed.

Owner confirmed the emulator is the only source and approved Supabase password
recovery/setup for genuine identities. Emulator password hashes will not be
imported. Verified-email state must not be trusted solely because the emulator
reports it.

Read-only source classification identifies one genuine SELLER account, its
profile/approved seller/artist records, 12 non-test artworks (one PUBLISHED,
11 SUBMITTED), and 13 image objects totaling 51,207,623 bytes. Snapshot checksums
and image hashes were verified; all 12 artwork IDs have a corresponding stored
image. Five artwork fixtures are excluded. Other Auth accounts are recognizable
test/incident/example identities. No account or artwork was imported or deleted.
Detailed source inventory, IDs and object hashes are local-only in ignored
`supabase/.temp/source-inspection.json`.

The only existing ADMIN is a non-deliverable local test account. The owner has
approved separate accounts: the genuine seller keeps SELLER and all artwork
ownership; the separate owner-selected email receives SUPER_ADMIN. Exact approved
emails are in `supabase/operators/bootstrap-owner-roles.sql`. That operator SQL
requires both Auth identities to exist, rejects unexpected existing roles,
assigns protected roles transactionally, and adds repeat-safe bootstrap audit
records. It does not create identities or mark email addresses verified.

Creating identities via the Auth Admin API is currently blocked: automatic
approval review rejected retrieving secret API keys, citing the owner's
credential restrictions. No key was retrieved or printed, and the request was
not retried. The safe owner action is Authentication > Users > Add user > Send
invitation for both approved emails. Roles must not be put in editable metadata.
The app's Supabase recovery route is not yet implemented; invitation creation
alone is not proof of working password setup or login. Hosted read-only checks
still show zero matching identities; the operator SQL has NOT been run remotely.

Three isolated PostgreSQL operator tests pass: distinct roles/idempotency,
missing administrator rolls back, and unexpected privileges fail closed. These
are included in `npm run test:supabase` alongside the 45 foundation tests.
Legacy seller approval has no reviewer UID; the migration must preserve that
unknown historical fact through explicit provenance rather than fabricating an
actor to satisfy the foundation's reviewed_by constraint.

## Remaining work

Source selection and genuine-record allowlist; Auth migration with UID mappings;
data and image migration/reconciliation; trusted moderation, checkout and stock
RPCs; Supabase AuthProvider/repositories/Storage/realtime integration; isolated
role, concurrency and end-to-end tests; runtime Firebase removal at cutover.
Payment integration remains deferred. Firebase rollback material stays intact.
