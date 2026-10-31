# Razorpay test payments

Module 2 extends the existing unpaid checkout; it does not create another cart or
order system. This implementation rejects live key IDs. The migration and Edge
Function are deployed; the first controlled payment is still pending. Do not use real payment instruments or dispatch goods for
test orders. Use controlled test artworks/inventory, preferably a staging project:
successful test captures intentionally consume that order's reserved inventory.

Local verification: 1,423 frontend tests across 163 files, 36 Edge tests,
76 SQL/RLS tests, and 33 script tests passed. Typecheck/build passed; lint has
57 existing warnings and no errors. These are local/mock/PGlite results, not
hosted Razorpay or multi-connection PostgreSQL evidence.

## Hosted readiness checkpoint (2026-10-10)

- Linked project verified: `fqxhjijxgdjfthmfokqk`. Dry run listed only
  `20261010141111_razorpay_test_payments.sql`; migration applied successfully.
- `razorpay-test` version 1 is ACTIVE, with the repository's `verify_jwt=false`
  configuration. HMAC/auth checks remain inside the deployed handler.
- Readiness: HTTP 200, enabled TEST. The configured server readiness guard checks
  test-key prefix, required secrets and manual capture setting; this does not
  authenticate credentials against Razorpay or inspect its Dashboard settings.
- Signed out: 401; malformed bearer token: 409/PAYMENT_REQUEST_REJECTED from the
  Auth rejection mapping; unsigned webhook: 401; unapproved origin: 403.
  Allowed CORS origin is `http://localhost:5173`.
- Hosted catalog confirms PUBLIC/anon/authenticated cannot execute any of the
  four payment RPCs; service_role can. All public tables have RLS. Existing
  order/payment policies allow owner reads, not browser writes.
- Data unchanged: 14 artworks, 18 physical units; zero orders, payments,
  reservations and reserved units. No payment creation/capture calls were made.
- Security advisor: 20 warnings for existing exposed SECURITY DEFINER functions
  and disabled leaked-password protection. None names the four gateway RPCs.
  Broader advisor remediation is separate from this deployment verification.
- Latest requested targeted frontend check: 13 files / 122 tests passed.
  Edge 36, SQL/RLS 76, typecheck, lint and build passed. Full frontend totals
  above are from the preceding implementation run, not a new full-suite run.
- `.env.local` is Git-ignored and has `VITE_ENABLE_RAZORPAY_TEST=true`; no
  privileged VITE variable names were found. Restart Vite before manual testing.
- First manual payment is pending credential rotation noted below. No commit
  or push has been made for Module 2; AR files are unchanged.

## Flow and security

1. Existing `create_checkout_order` creates immutable prices/address/items and a
   30-minute reservation. Browser totals are never accepted.
2. The authenticated Edge Function calls service-only
   `begin_razorpay_test_payment`. PostgreSQL rechecks the verified buyer's role,
   ownership and live reservation under an order row lock.
3. One `payments` row/provider order exists per ArtVault order. Only its first
   creator calls Razorpay Orders; subsequent requests reuse that provider order.
4. The browser loads Razorpay Checkout lazily. It receives only the test public
   key ID, provider order ID, local payment ID, server amount and currency.
5. Callback HMAC uses the **stored** provider order ID. Webhook HMAC uses the raw
   body and a separate secret. The server fetches payment facts from Razorpay and
   checks order association, amount, currency and captured state.
6. `claim_razorpay_test_capture` locks the order and checks active reservations
   before the server sends capture. Only the first claimant may send capture.
   Expiry uses the same lock and skips `CAPTURING`/`REVIEW` payments.
7. `record_razorpay_test_result` atomically records verified event provenance,
   marks payment `SUCCEEDED` and order `PAID`, consumes reservations, and decrements
   physical and reserved quantity together. Repeated callbacks/events cannot
   consume stock twice. Zero available stock continues to use existing availability
   logic; artwork moderation status is not repurposed as an inventory state.

All four gateway RPCs revoke PUBLIC/anon/authenticated execution. Only the trusted
service role can call them. Existing buyer payment/order RLS remains in force;
ordinary clients and app admins cannot write authoritative payment state.
`verify_jwt=false` is intentional for the signed webhook route. All buyer actions
independently verify the session with Supabase Auth, and ignore body UID/role hints.
The public readiness action returns only an enabled boolean and TEST mode.

The new `orders.payment_mode` and `payments.mode` explicitly record `TEST`.
Order details, confirmation and buyer history label these records as sandbox.
Current orders contain `ITEMS_ONLY` prices. Test checkout uses that stored subtotal;
it does not invent zero shipping/tax or declare production pricing finalized.
Fulfillment/payout integrations must exclude TEST orders.

## Configuration required from the owner

The owner configured hosted test secrets. Readiness returned enabled TEST mode.
Credential values were subsequently found in this local guide and removed; no
other non-ignored file contained those exact values. Because the values appeared
in an inspection tool response, rotate the test API key pair and webhook secret
before the first payment. Update Supabase Edge secrets and the Razorpay test
webhook secret together. Never put values back in this document or paste them
into chat.

1. In Razorpay Dashboard select **Test Mode**, then **Account & Settings → API
   Keys → Generate Test Key**. Store keys only in a Git-ignored server env file or
   Supabase Dashboard **Edge Functions → Secrets**. Never use live keys.
2. Under **Account & Settings → Payments Capture**, select **Manual Capture**.
   The server only captures after validating stock. Leave bank-transfer methods
   out of testing; their automatic-capture behavior differs.
3. Configure these server-only names:

   ```text
   RAZORPAY_TEST_ENABLED=true
   RAZORPAY_TEST_KEY_ID
   RAZORPAY_TEST_KEY_SECRET
   RAZORPAY_TEST_WEBHOOK_SECRET
   RAZORPAY_CAPTURE_MODE=manual
   PAYMENTS_ALLOWED_ORIGINS=http://localhost:5173
   ```

   Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the Edge
   runtime. Never copy that privileged key into Vite configuration. A distinct
   random webhook secret is required. No credentials are stored in this guide.
4. **Owner approval is required before applying/deploying** the migration/function.
   Review `20261010141111_razorpay_test_payments.sql`, confirm the linked project,
   inspect `supabase db push --linked --dry-run`, then apply only the reviewed
   migration. Deploy `razorpay-test` with the repository's function configuration.
   Owner approval was received and deployment completed on 2026-10-10 to
   `fqxhjijxgdjfthmfokqk`; only the named migration and `razorpay-test` were deployed.
5. Configure a **Test Mode** Razorpay webhook:

   ```text
   https://fqxhjijxgdjfthmfokqk.supabase.co/functions/v1/razorpay-test/webhook
   ```

   Subscribe to `payment.authorized`, `payment.captured`, `payment.failed` and
   `refund.processed`. Use the same server webhook secret. Check delivery logs.
   Partial/full refunds detected through provider API facts enter REVIEW; this
   module does not initiate refunds or automatically restock refunded orders.
6. Only after configuration, set `VITE_ENABLE_RAZORPAY_TEST=true` in ignored
   `.env.local` and restart Vite. It is a UI opt-in, not authorization. The server
   must also report ready; unavailable configuration never exposes an enabled Pay
   action. Normal Card/UPI/COD live controls remain disabled.

## Failure and recovery

### Expiry checkpoint and automatic scheduling (2026-10-11)

The existing `expire_checkout_reservations(integer)` RPC is operator-triggered
and checks protected ADMIN/SUPER_ADMIN authorization. It locks pending orders,
skips CAPTURING/REVIEW payments, releases only active reservations, preserves
physical quantity, and records cancellation without deleting history.
With owner approval it released order `59d622ec-0387-42f5-af52-cbad4eae4751`;
a second invocation returned zero. The order is CANCELLED, reservation RELEASED,
and its artwork has physical/reserved/available quantities 1/0/1. No payment exists.

The payment panel now removes Pay for server-recorded released reservations or
elapsed stored deadlines, including while the page stays open. The client clock
is only a display safeguard; database checks remain the payment authority.

With subsequent owner approval, migration
`20261011075254_automatic_reservation_expiry.sql` enables native `pg_cron` and
registers `artvault-expire-checkout-reservations` on `* * * * *` (every minute).
It calls `private.expire_checkout_reservations(100)` as database owner `postgres`.
The single shared release body retains order locking, capture/review protection,
atomic rollback on failure, and repeat-safe release. The public operator RPC
retains its protected ADMIN/SUPER_ADMIN check and delegates to that worker.
PUBLIC, anon, authenticated and service_role cannot execute the private worker.
No HTTP endpoint, Edge deployment, user JWT, administrator UID or secret is needed.

Monitor the job and `cron.job_run_details` in Supabase Dashboard → Integrations →
Cron. Alert operationally on failed/missing runs and growing expired-active backlog;
CAPTURING/REVIEW holds intentionally require trusted payment reconciliation.
The 100-order batch is a cap, not a guarantee that every overdue order clears in
one run; lock contention and protected holds can defer work. Cron runs independently
of Vite/browser uptime. Disabling the job stops future runs without deleting history.
See https://supabase.com/docs/guides/cron for job/run monitoring.

Local SQL tests execute the real shared worker/wrapper and ACLs. PGlite cannot run
background-worker extensions, so only Cron extension installation/registration is
substituted by an explicit test double. Actual hosted job runs must be verified
separately; local tests alone do not prove scheduling.

Hosted scheduler verification: three consecutive unattended runs succeeded at
07:55, 07:56 and 07:57 UTC on 2026-10-11. The existing cancelled order and released
reservation remained unchanged, inventory stayed 1/0/1 and payment rows stayed 0.
Current scheduler checks: SQL/RLS 89, payment handlers 36, targeted frontend 127,
script tests 33 passed. Typecheck/build passed; lint retained 57 warnings, no errors.
No new checkout, payment initiation or capture was performed.

Historical verification before scheduler work: 36 payment-handler, 83 SQL/RLS, 127 targeted
frontend and 33 script tests passed; typecheck, lint and build passed. The new
expiry tests preserve unrelated reservations and prove paid/capturing orders
remain protected. No new checkout or Razorpay call was made.

- Browser dismissal does not cancel a trusted order or release stock. A failed
  attempt is retryable against the same provider order while its reservation lives.
- **Unknown provider-order creation:** the row remains `CREATING`; no blind retry
  creates another provider order. An operator must locate the unique payment UUID
  receipt in the Test Dashboard, verify amount/currency, and attach that exact
  provider order using the service-only attachment RPC. Do not delete/reset rows
  or repeat creation to hide an uncertain response.
- **Unknown capture:** leave the reservation held. Webhooks or the buyer's
  **Check payment status** fetch the provider's current state and settle a captured
  payment. If it remains authorized after a crashed capture worker, operator
  investigation is required. No timer assumes that money was not captured.
- A provider-confirmed terminal failure removes an active capture hold, allowing
  normal expiry. A stale failed attempt cannot reverse a successful payment.
- Captured payment after reservation release is `REVIEW`, never a resurrected
  order or negative stock. Refunds/late-capture resolution require an operator;
  automatic refunds, reconciliation scheduling and live fulfillment are not part
  of this test integration. A verified refund event is flagged for review without
  inventing refund/restock transitions.

## Verification and owner test checklist

Offline tests use mocked HTTP and isolated PGlite PostgreSQL. They never contact
hosted Supabase or Razorpay. Run sequentially:

```powershell
npm.cmd run test:payments
npm.cmd run test:supabase
npm.cmd test -- --run src/features/payments src/features/orders src/features/checkout --pool=threads --maxWorkers=1 --fileParallelism=false
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:scripts
git diff --check
```

Before accepting Module 2, test configured Razorpay **Test Mode** end to end:

- Controlled buyer checkout → correct stored subtotal → Razorpay test form.
- Provider success → server verification/capture → one paid TEST order and one
  inventory consumption; refresh and reopen buyer history.
- Failure, dismissal, retry, lost callback and Check payment status.
- Duplicate signed webhook, invalid signature, wrong buyer, wrong amount and
  simultaneous payment/capture requests from two tabs.
- Expiry winning before authorization versus capture winning before expiry.
- Webhook delivery after closing Vite/browser and after a provider/API timeout.
- Actual concurrent PostgreSQL sessions, hosted RLS and deployed Edge runtime.

In-memory lock-order tests do not substitute for true concurrent hosted sessions.
No real provider payment, signature delivery, hosted deployment or phone/browser
checkout is claimed until these tests run with owner-approved configuration.

Provider references: [Web integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/),
[webhook validation](https://razorpay.com/docs/webhooks/validate-test/),
[capture settings](https://razorpay.com/docs/payments/payments/capture-settings/),
[Supabase Edge authentication](https://supabase.com/docs/guides/functions/auth).

## Module 2 changed-file inventory

These 30 files are separate from the already pushed Module 1/AR checkpoint:

```text
.env.example
ARTVAULT_PROJECT_STATE.md
package.json
src/app/routes/CheckoutPage.tsx
src/app/routes/OrderConfirmationPage.tsx
src/app/routes/OrderDetailsPage.tsx
src/config/env.test.ts
src/config/env.ts
src/features/checkout/components/PaymentMethodSelector.tsx
src/features/checkout/components/PaymentSection.test.tsx
src/features/checkout/components/PaymentSection.tsx
src/features/orders/api/orderRepository.test.ts
src/features/orders/api/orderRepository.ts
src/features/orders/components/OrderCard.tsx
src/features/orders/components/ReservationNotice.tsx
src/features/orders/hooks/useOrder.ts
src/features/orders/types.ts
src/features/payments/api/razorpay.test.ts
src/features/payments/api/razorpay.ts
src/features/payments/components/TestPaymentPanel.test.tsx
src/features/payments/components/TestPaymentPanel.tsx
supabase/config.toml
supabase/functions/razorpay-test/handler.test.ts
supabase/functions/razorpay-test/handler.ts
supabase/functions/razorpay-test/index.ts
supabase/migrations/20261010141111_razorpay_test_payments.sql
supabase/tests/foundation.test.mjs
tsconfig.payments.json
vitest.payments.config.ts
docs/RAZORPAY_TEST_PAYMENTS.md
```

No AR engine, Auth implementation, hosted data, credentials or dependencies were
changed. `package.json` adds test/server-typecheck commands only; no packages were
installed or removed. The local AR audit/selection files remain outside Git.

### Owner acceptance ? 2026-10-11

The controlled ?5,500 TEST payment passed: order PAID, payment SUCCEEDED/SETTLED,
reservation CONSUMED, physical/reserved/available 0/0/0. Verified webhook and
callback events produced only one inventory consumption and PAID transition.
Three subsequent expiry runs preserved settlement. Owner approved the Module 2
checkpoint. UPI/QR, live payments and real fulfillment remain outside Module 2.
