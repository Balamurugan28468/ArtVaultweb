# Supabase foundation — deployed schema, runtime migration pending

## Hosted migration checkpoint (2026-09-19 IST)

The owner approved full migration. Authenticated CLI access to project
`fqxhjijxgdjfthmfokqk` was verified and the three foundation migrations below
were applied with `db push --linked --project-ref ... --skip-vault`.
Remote catalog verification found 35 RLS-enabled application tables, 45 policies,
208 constraints, 131 indexes, 35 application timestamp triggers and one Auth
signup trigger. Both Storage buckets are private. No users, business records or
files have been migrated. Firebase remains the application runtime until cutover.
See `SUPABASE_MIGRATION_CHECKPOINT.md` for the source-identity decision blocking
the next step. The following foundation notes describe its original local-only
checkpoint; references to "unapplied" below are historical, superseded here.

ArtVault remains a React/TypeScript/Vite SPA. Firebase is still the live backend
and legacy/rollback implementation. No Firebase users, snapshots, media, AR,
commerce, moderation, AuthProvider, repositories or UI were migrated or changed.

## One application backend architecture

- `@supabase/supabase-js`: sole Supabase application client dependency.
- Ordinary access: Data API with RLS and column grants.
- Authoritative transactions: future reviewed PostgreSQL RPCs.
- External providers/webhooks: future Edge Functions with verified identity/signatures.
- Realtime: not enabled until authorized subscriptions and cleanup are implemented.

There is no SSR runtime or Bearer-JWT server handler in this phase. Removed
`@supabase/ssr`, `@supabase/server`, Prisma, Postgres.js and direct dotenv dependency,
plus unused server/ORM files. `components.json` was only registry scaffolding;
its root TypeScript alias workaround and Prisma ignore entry were removed.
The existing Vite/app TypeScript aliases remain untouched.

## Environment and activation

Browser variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
Existing values remain in ignored `.env`; ignored `.env.local` overrides the two
browser variables for the owner-selected project and contains no server/ORM placeholders. Never put privileged keys, database URLs/passwords or
access tokens in Vite variables. The lazy client rejects secret-key prefixes.
No live app module imports it. Cloud settings exist but the app still uses Firebase.
The separately registered user-level MCP was not used. No schema has been deployed.

Read-only connectivity verification for project `fqxhjijxgdjfthmfokqk`:
Vite loaded the local browser configuration; Auth settings returned HTTP 200.
A supabase-js `profiles` query with a zero-row limit reached PostgREST and returned
HTTP 404 / PGRST205 (table absent from the schema cache). A separate raw REST-root
request using only the apikey header returned HTTP 401. This proves Auth endpoint
access and SDK/Data API reachability, not successful application-table access,
user login, hosted RLS or a backend migration. No remote records were modified.

## Migrations

1. `20260919000100_foundation.sql`: relational tables, constraints, indexes,
   timestamps and default-deny RLS/grants from table creation.
2. `20260919000200_roles_and_rls.sql`: CUSTOMER signup provisioning, protected
   roles, owner/public policies, column grants and bounded seller summaries.
3. `20260919000300_storage.sql`: private buckets and restricted object policies.

These unapplied migrations target an owner-approved fresh Supabase project with
managed auth/storage schemas. Inspect existing destination tables, policies,
buckets and triggers before deployment. Permissive pre-existing Storage policies
must not be assumed absent. No existing auth users are backfilled.

All 33 public and two private application tables have UUID primary keys, RLS,
timestamps and explicit grants. FK groups are indexed. Existing Firebase IDs
require an explicit later mapping; no IDs are converted now.

Public tables: profiles, seller_profiles, artist_profiles, categories, artworks,
artwork_images, inventory, carts, cart_items, wishlist_items, likes, follows,
addresses, orders, order_addresses, order_items, inventory_reservations,
order_events, payments, payment_events, refunds, shipments, shipment_items,
auctions, auction_items, bids, notifications, admin_logs, artwork_ar_assets,
artwork_analyses, ai_conversations, ai_messages, artwork_tags.

Private tables: user_roles, checkout_requests.

## Security boundaries

auth.users is identity authority. Signup inserts a profile and CUSTOMER role in
one transaction, ignoring editable metadata. Normal clients cannot access the
private role table. Helpers use auth.uid(), stored roles, fixed search paths and
explicit execute grants. No promotion RPC exists; admin bootstrap needs approval.

Profiles, carts, addresses, wishlists, likes and follows are owner-scoped. Public
artwork reads require PUBLISHED; private artwork is limited to owner/admin.
Sellers can create/edit drafts but cannot publish or write review fields. Seller
approval and moderation writes remain closed until trusted RPCs are implemented.

Buyers read their orders, items, events and address snapshots. Sellers read their
own items plus get_seller_orders(): at most 100 item summaries, without buyer
identity/address, whole-order totals or other sellers' items. Admins do not get
blanket buyer-order access. Admin logs are admin-readable, never client-writable.

Inventory/reservations, orders/events, payments/events/refunds, shipments, bids,
AR readiness and AI responses have no authoritative client write grants. Future
service-role code bypasses RLS and must authorize operations independently.

Inventory enforces physical >= reserved >= 0 and computes availability. Reservation
FKs match artwork/order items; checkout keys are unique per buyer. These are NOT
implemented checkout/expiry RPCs. Cross-row sums, refund limits, shipment totals,
auction holds and payment/expiry races still require trusted transactions.

Storage buckets are private. Reads require eligible published metadata or image
ownership. Source-hash mismatch hides AR metadata/objects. Image uploads require
preallocated metadata, seller ownership, DRAFT state and zero reservations. There
is no overwrite/delete policy. Attachment/finalization and cleanup require future
trusted operations; existing Firebase uploads are unchanged. Future signed URLs
need an explicit expiry/moderation-revocation policy.

## Isolated verification

`npm run test:supabase` runs dev-only PGlite (PostgreSQL/WASM) in a fresh in-memory
instance, one process, with no URL, environment loading or network DB connection.
It executes these migrations and tests real SQL constraints, grants, RLS and
functions under anon/authenticated roles. Minimal test auth/storage schemas stand
in for Supabase-managed schemas; JWT verification and Storage HTTP are not emulated.
PGlite is a test harness, not an application database or alternative ORM.

Hosted Auth, Data API, Storage MIME/size enforcement, Realtime, managed schema
compatibility and real concurrent connections still need an approved isolated
Supabase environment. No cloud/production-readiness claim is made. Existing
Firebase tests remain intact; this phase does not rerun those heavy suites.

## Next owner gates

Approve schema/RLS, target environment and UUID mapping strategy. Inspect an
isolated target and explicitly approve migration application. Confirm admin
bootstrap, signup/email behavior, bucket delivery and role-management policy
before UI integration. No deployment/backend switch/data migration is automatic.
