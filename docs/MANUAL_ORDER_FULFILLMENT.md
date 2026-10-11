# Module 3: manual order fulfillment

Module 2 checkpoint: `2e2900f`, pushed to `origin/supabase-full-cutover`.

## Audit and scope

Existing: normalized orders/items/addresses, immutable purchase snapshots,
shipments/shipment_items, buyer-only history, seller item reads, transactional
checkout/reservations, trusted TEST settlement, inventory constraints and Cron expiry.
Missing: usable seller fulfillment projection/actions, tracking entry, shipment
display, and enforced multi-seller fulfillment progression. These are added without
a second order/inventory system. No AR, UPI/QR, payment-provider or admin-module work.

## Lifecycle and authority

`PAYMENT_PENDING → PAID → PROCESSING → SHIPPED → DELIVERED` uses existing order
statuses. Each seller has one shipment per order covering all their line items.
Creating that shipment uses existing shipment `PENDING` (displayed as PROCESSING),
then `SHIPPED → DELIVERED`. Split shipments/partial quantities are not supported.
The overall order is PROCESSING until every seller's items have shipped, and is
DELIVERED only after every seller's items are delivered. Delivery is a seller's
manual declaration, not independently confirmed courier data.

`advance_seller_fulfillment` requires the protected SELLER role, approved seller
profile, owned items, a paid non-TEST order and matching successful non-TEST payment.
An unpaid, TEST, refunded or REVIEW payment cannot authorize dispatch. The order
row is locked first, serializing sellers and preserving existing payment/expiry
lock ordering. Repeated identical actions do not duplicate shipments or timeline
events; backward transitions or changed tracking after shipment are rejected.

Tracking is plain text: carrier and tracking number, each 2–100 characters, with
server validation. No tracking URL, invented shipping fee/estimate, courier API,
automatic payment, cancellation, refund or restock is introduced.

Fulfillment never changes inventory. Reservation expiry releases unpaid stock;
verified settlement consumes it once. Paid cancellation/refund/restock remain
trusted operator-review work; this module provides no shortcut around payment.

## Privacy

`get_seller_fulfillment_orders` returns up to 100 recent paid orders, containing only
the caller's items, their shipment, and the address snapshot needed for eligible
live fulfillment. It excludes buyer UID, provider payment IDs, other sellers'
items and full order totals. TEST orders are read-only and omit the address.
Private eligibility helpers cannot be called by browsers. Existing RLS on orders,
shipments and shipment_items is unchanged; no client shipment writes are granted.
Buyer shipment reads use existing owner-scoped policies. No new admin access.

## Migration and hosted verification

`20261011082427_manual_order_fulfillment.sql` adds one unique index and three
functions. Preflight confirmed zero shipments/duplicate groups. Linked dry-run
listed only this migration; it was applied to `fqxhjijxgdjfthmfokqk`.
The real seller's projection returned the existing TEST order with canFulfill=false,
address=null. An attempted TEST transition was rejected inside a rolled-back
verification transaction. Existing PAID order/payment timestamps and inventory
remained unchanged; hosted shipment count remains zero.

Security advisor warnings include intentional authenticated SECURITY DEFINER
entrypoints and pre-existing public helpers; leaked-password protection is disabled
in Auth. This module does not claim a complete platform security audit.

## Owner testing and limits

Owner acceptance (2026-10-11): Seller Studio correctly displayed order #4c0ef8b5,
PAID, Beyond the Grand Line – A Pirate's Dream, quantity 1, INR 5,500 and its
thumbnail. The TEST warning was visible and no dispatch controls were exposed.
Module 3 is accepted for this scope based on automated verification, isolated
lifecycle fixtures and this browser review; its checkpoint commit/push is approved.

1. Seller Studio: Incoming paid orders shows the genuine TEST purchase and thumbnail.
   Refresh works. No processing/shipping button or shipping address appears for it.
2. Buyer: My Orders/details still show the stored price, address, thumbnail, payment
   reference, TEST badge and timeline. Shipment panel explicitly says no real shipment.
3. A customer or unrelated seller must not see this seller's fulfillment data.
4. Check desktop and narrow/mobile layouts, loading/error recovery and keyboard forms.

Live processing/shipping/delivery transitions were tested on isolated in-memory SQL
fixtures and mocked frontend boundaries, not fabricated hosted purchases. A genuine
live payment path is not enabled. Final end-to-end manual verification of
PAID → PROCESSING → SHIPPED → DELIVERED remains required when a genuine non-TEST
payment environment/order is available.
Do not alter the successful hosted TEST order to bypass this guard.

Seller list refresh and buyer Refresh order fetch current stored state; no new
global Realtime subscription. Pagination beyond the newest 100 paid orders, tracking
corrections after shipping, returns/refunds, split shipments, courier integration,
delivery confirmation by a courier and full Admin tooling remain deferred.
