# Module 05 integration fixes

The local migration `20261020153833_auction_e2e_lifecycle.sql` has not been applied to hosted Supabase. Owner approval is required before deployment or hosted auction testing.

## Trusted lifecycle

The existing `artvault-close-auction-lots` Cron job runs `private.run_auction_lifecycle(50)` every minute. It activates due scheduled events using database time, closes ended events (including zero-bid lots), and reuses checkout reservation expiry. Events whose entire window passed become ended without opening late bidding. A scheduled event can take up to the next Cron execution to become live.

Bids serialize with event closing and other bids on the same lot. The server rejects early/late bids, inactive buyers, seller self-bids and amounts below the current minimum. Sanitized invalidations refresh the catalog and auction detail through Realtime without publishing lot or bid rows.

## Winner privacy and Realtime

`auction_items` has no ordinary client SELECT grants, including column grants, and its former public SELECT policy is removed. Direct reads default to denial even if a future table grant is accidentally restored. Only trusted operations and the existing authorized admin/seller RPCs can read private winner/order identifiers.

The public `get_public_auctions()` response contains no winner UUID or order UUID. It returns `is_current_user_winner`, calculated from the verified caller UUID by PostgreSQL, plus public catalog/bid aggregates. The payment deadline is returned only to the actual winner. The public frontend uses `isWinner` and discards legacy winner/order fields; both catalog and detail refresh when the signed-in identity changes. Winner checkout continues to re-check the authenticated winner independently.

Realtime publishes `auction_realtime_signals` instead of `auction_items`, `bids` or `auctions`. Each signal contains only its own notification UUID, source kind, public event/lot key, auction UUID, revision and timestamp. No arbitrary JSON, bidder identity, order reference, bid amount or idempotency key is stored. Only protected database triggers write signals. Anonymous users and authenticated users can read them through an explicit RLS SELECT policy and cannot insert/update/delete them.

There is at most one signal row per event/lot, not one row per bid. Draft sources emit nothing; withdrawal of a previously public event emits an invalidation so clients remove it from the public catalog. Notification keys deliberately have no business foreign keys: a lot notification must not acquire a parent-auction lock in the reverse of the existing settlement lock order. Source-specific signal rows also avoid a shared parent notification lock. These rows are disposable invalidations, never authorization or financial state.

## Winner checkout and payment

The winner selects a saved, complete address. The trusted RPC creates one `PAYMENT_PENDING` TEST order at the winning bid, with immutable address, item and image snapshots, and one inventory reservation. A unique index and transaction locks prevent duplicate orders; retries recover the original order, including cancelled or paid history. The UI navigates directly to `/orders/:orderId`, where existing owner-only order access and Razorpay TEST controls apply.

The payment transaction consumes inventory once. A protected order trigger marks the lot `SETTLED` only after verified TEST payment settlement and consumed reservations. Expiry marks linked lots `PAYMENT_EXPIRED` through the existing order-first expiry transaction. CAPTURING/REVIEW protection is retained. Expiry never deletes order history or restocks a paid purchase.

## Deployment and manual checks

Before approval/application, inspect hosted winner orders for duplicates, incomplete address snapshots or inconsistent lot links. Migration preflight rejects these conditions rather than rewriting history. Review a linked dry-run; apply only after owner approval. No payment secrets or Edge Function deployment are needed for this migration. It updates the existing Cron job, removes raw auction/lot/bid publication entries, and adds only the sanitized signal table for auction notifications. Existing order publication entries are preserved. The migration replaces the public RPC signature without CASCADE and restores its explicit execute grants; deploy the corresponding frontend at the same checkpoint. It does not rewrite or delete business records.

After application, use approved test accounts to verify scheduled activation, two competing bidders, automatic closing, winner-only checkout, repeat-click recovery, saved shipping snapshot and one controlled Razorpay TEST payment. Confirm the paid order and settled lot agree and inventory is consumed exactly once. Also verify a zero-bid auction and unpaid expiry. Do not use LIVE keys or real-money payments.

Local SQL tests use isolated PostgreSQL fixtures and simulated trusted provider results; they do not contact Razorpay, run a hosted payment, or prove multi-connection contention. They exercise actual publication catalog/DDL and table/RPC permissions, including removal of previously published private lots; no live Realtime gateway is used. Hosted Cron timing, Realtime delivery and the complete browser/provider flow still require manual verification. Inventory is checked during bidding and reserved atomically at winner checkout; stock becoming unavailable before checkout produces a safe rejection, not an oversell. Current auction scheduling and winner checkout support quantity-one lots.
