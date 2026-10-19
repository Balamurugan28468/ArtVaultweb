# Core ordering and inventory reservations

Owner-authorized implementation after UI-07. This checkpoint adds real unpaid
orders to the existing Firebase application. It does not implement payments,
shipping fulfillment, auctions or AR changes. The pre-existing uncommitted AR
checkpoint and its files are preserved; physical-device AR validation is separate.

## Trusted checkout

`createCheckoutOrder` is an authenticated callable for CUSTOMER/SELLER tokens.
Input is `{ artworkIds: string[], addressId: string, idempotencyKey: string }`.
It accepts 1–50 distinct cart artwork IDs. Buyer identity is exclusively the
verified token UID; explicit UID fields are rejected. Prices, totals, quantities,
currency and payment fields supplied by a client never determine the result.

One Firestore transaction reads the buyer's saved address and selected cart
documents, plus every artwork. Each must be PUBLISHED, have a different seller
from the buyer, a valid price, and sufficient available inventory. Quantity comes
from the buyer's stored cart, not the request. Missing/unavailable artwork,
invalid addresses and unavailable stock reject the entire operation.

The transaction atomically creates the order, immutable order items and retry
record, increments reservations, and deletes only the represented cart items.
No browser writes orders, prices or stock. Failure preserves stock and cart.
Client rules continue to deny all order writes, even by admins; trusted backend
operations use Admin SDK authorization checks.

## Minimal schema evolution

- Existing `artworks/{id}.inventoryCount` remains **physical units**, not available
  units. New backend-owned `reservedCount` is the sum of active reservations.
  Absent legacy counters mean zero. Available units = physical minus reserved.
  No migration rewrites old artworks or owner data.
- `orders/{id}` retains the existing buyer/status/address/history/preview fields.
  Adds `currency: INR`, `pricingState: ITEMS_ONLY`, `taxCost: null`,
  `reservationStatus: ACTIVE`, and a server-generated `reservationExpiresAt`
  (30 minutes). Existing subtotal/total both represent merchandise only;
  `shippingCost` remains null. **This is not a final payable total.** Shipping,
  taxes and payment pricing need trusted design before payment integration.
- `orders/{id}/items/{artworkId}` snapshots artwork ID, seller ID, title, unit
  price (integer paise), quantity, line subtotal, first image URL/path (nullable).
  These are immutable to clients. Image references are not archival image copies.
  One checkout can include several sellers. No new seller order reads are granted.
- Private `checkoutRequests/{sha256(buyerUid + NUL + idempotencyKey)}` contains
  buyer/order IDs, request fingerprint and creation time. Order ID is the same
  digest. All client access is denied by the existing catch-all rule.

Amounts stay integer paise server-side. Client amounts are estimates until the
trusted receipt; screens preserve paise instead of rounding to whole rupees.

## Lifecycle and retry behavior

Creation records history `CREATED → PAYMENT_PENDING`, with `paymentState: PENDING`.
This operation never creates PAID. On expiry, the stored order becomes CANCELLED,
`cancellationReason: RESERVATION_EXPIRED`, reservationStatus RELEASED, with release
time and history. Items and address snapshots remain. Payment stays PENDING;
no payment or refund is fabricated, and no cart items are automatically restored.

A per-buyer idempotency record fingerprints sorted selected IDs and saved address
ID. Repeated/concurrent requests with that key return the original order without
reserving twice or deleting later cart additions. Reusing it for different IDs
or an address is rejected. Even an expired order replays its original result.
The browser retains that request in buyer-scoped session storage before sending
it. An ambiguous network error offers recovery, including after cart deletion or
page reload. A definite validation rejection permits a corrected fresh request.

## Seller stock and security

`setArtworkInventory` requires a SELLER token and matching artwork owner. It
transactionally changes physical inventory only if the new value is at least
reservedCount. It shares the artwork transaction conflict boundary with checkout
and expiry. Existing DRAFT creation can declare initial physical stock; once
created, stock updates use this callable. SUBMITTED artwork remains edit-locked.
Direct client counter changes are denied by rules. Price/content editing retains
the existing moderation workflow; stock adjustment and metadata saving are two
separate operations. If metadata saving fails after a successful stock adjustment,
stock may already have changed; reload before retrying. No success is shown for
a failed combined save.

Reserved artworks cannot be hard-deleted. Storage rules block image deletion or
replacement while reserved. Removing a listing from sale or admin suspension
still works and immediately blocks new checkout; existing orders retain snapshots.
Buyer order privacy, other sellers' ownership boundaries and moderation are
unchanged. Seller-specific fulfillment views remain deferred and must not expose
another seller's private order data.

## Local expiry and owner review

There is deliberately no paid scheduler requirement. An ADMIN/SUPER_ADMIN may
invoke `expireCheckoutReservations`. For local development, from the repo root:

```powershell
npm.cmd --prefix functions run build
node functions/scripts/expire-checkout-reservations.mjs --demo-artvault-only
```

The operator command explicitly targets only demo-artvault on 127.0.0.1:8080;
it releases actual expired unpaid reservations, not all reservations. Each call
processes up to 50 due orders. Repeat when `mayHaveMore` is true. Release is a
transaction guarded by stored ACTIVE/PENDING state, so repeated/concurrent runs
release exactly once. A new composite order index supports the due-order query.
**Expiry is not automatic today:** stock stays reserved until this trusted
routine runs. Production will need a reliable scheduled/retried sweep and alerts.
Never use Firestore TTL deletion to release stock.

Owner review with the existing development emulators (no reset/import):

1. Build Functions once; the running Functions emulator loads the new exports.
   Use the existing Vite process and approved CUSTOMER/SELLER accounts.
2. Add another seller's PUBLISHED artwork with positive available stock to Cart.
   Checkout requires a valid address saved under the signed-in buyer; a temporary
   address can be carried into Add new address and saved first.
3. Create unpaid order. Verify the payment-pending route, stored address/items,
   exact merchandise subtotal and cart cleanup. No payment method is enabled.
4. Inspect physical/reserved/available stock as the seller. Try reducing physical
   below reserved: this must fail. No unrelated cart item should be removed.
5. After 30 minutes run the operator expiry command, refresh the order, and verify
   CANCELLED/RELEASED and available stock restored. Repeat the command: no second
   release. Do not edit production orders/counters manually to test expiry.

## Verification commands

Heavy checks run sequentially. Integration and rules tests use only disposable
demo-artvault-test (Firestore 8280), fail closed on the owner emulator address,
and never import/export the owner's persisted data.

```powershell
node scripts/run-isolated-emulator-tests.mjs commerce
npm.cmd --prefix functions test -- --maxWorkers=1 --no-file-parallelism
npm.cmd run test:rules
npm.cmd run test:storage-rules
npm.cmd run typecheck
npm.cmd --prefix functions run typecheck
npm.cmd run lint
npm.cmd test -- run --maxWorkers=1 --no-file-parallelism
npm.cmd run build
npm.cmd --prefix functions run build
git diff --check
```

Concurrency tests use real Firestore transactions, including two buyers for one
unit, checkout racing seller adjustment, duplicate checkout requests, and concurrent
expiry. Unit/component tests cover auth/input validation, saved address selection,
unpaid confirmation, payment-disabled controls and ambiguous-response recovery.

Before payment integration: decide provider/currency/fees/tax/shipping; implement
verified webhooks and atomic reservation consumption versus expiry, payment
idempotency/reconciliation, buyer cancellation policy, abuse controls and seller
fulfillment. No card storage, charge, payout, refund or paid lifecycle is included.
