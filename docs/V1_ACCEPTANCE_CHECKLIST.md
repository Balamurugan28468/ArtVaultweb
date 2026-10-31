# ArtVault V1.0 acceptance checklist

Scope: the current nine-module V1.0 only. Automated/local fixture success does not
mean hosted, physical-device or production payment acceptance. References and
mockup artwork are not evidence of implemented features.

## Local versus hosted acceptance matrix

| Area | Local evidence | Existing owner/hosted evidence | Still required |
| --- | --- | --- | --- |
| Auth prerequisite | Native OTP/form/error/session/profile/guard tests; blank login + disabled initial OTP browser smoke | Owner reports real signup/OTP/login 10/10 | Post-release exact-email login/logout/refresh, email template + SMTP/OTP-six-digit configuration review |
| 01 Cart/Checkout | Cart/stock/totals/address/retry suites; transactional SQL ownership/reservations | Previously accepted saved-address/checkout flow | Controlled multi-user checkout race and expiry timing on approved staging |
| 02 Payments | 36 mocked handler cases, SQL settlement/idempotency/RLS | Owner's ₹5,500 TEST order accepted; preserve it | Post-release TEST webhook/callback/reconciliation acceptance with owner authorization; no LIVE/UPI/QR |
| 03 Orders/Fulfillment | Buyer image/history/timeline and seller-scoped lifecycle SQL/UI tests; fixture buyer/seller browser | Owner verified read-only TEST seller order | Genuine non-TEST fulfillment end-to-end deferred; do not alter TEST payment to bypass safeguards |
| 04 Admin | Role/suspension/moderation/audit SQL + components; ADMIN/SUPER_ADMIN browser and buyer/seller denial | Prior module owner acceptance | Hosted permission comparison and safe post-release admin smoke |
| 05 Auctions | Actual local RPCs: activation, bids, zero-bids close, winner/address/order/payment/expiry/privacy; fixture public/admin browser | Latest integration/privacy migration NOT deployed | Native cron timing, two-account bidding, live sanitized Realtime, winner-only TEST checkout, payment settlement |
| 06 Weekly Top 5 | Eligibility, distinct engagement, deterministic fairness/ranking, review, atomic <=5 lots, stale/concurrency guards; admin fixture UI | NOT deployed | Approved schedule, three-day window and retry job; host locks/contention; manual admin review/schedule |
| 07 Assistant/Recommendations | Canonical FAQ, private history/quotas, ownership, eligible personalized/public recommendations; guest FAQ + recommendation browser | NOT deployed | Hosted history ownership/cross-account and actual signed media; fallback must remain labeled FAQ/heuristic |
| 08 AR | 72 focused AR cases in previous module; full regression and generation/security tests; browser non-AR fallback | Older owner physical success precedes latest repairs | Current physical Android Lock/Unlock regression and production authorized model delivery |
| 09 Integration QA | Migration rollback/signatures, network isolation, image degradation, reconnect recovery, full regression, browser widths | No hosted changes allowed | Complete release runbook and owner acceptance; not a production-deployed claim |

## Buyer and guest checklist

- [x] Public marketplace/artwork/artist profile/recommendation/auction route integration exercised locally.
- [x] Search/category/price/cursor components and repositories have automated regression coverage.
- [x] Wishlist/likes/follows/share and cart quantity limits retain existing tests.
- [x] Guest protected checkout is redirected without loading another user's order.
- [x] Native signup validation, OTP controls and blank manual sign-in retain tests.
- [x] Address completeness/selection and server-authoritative checkout remain tested.
- [x] Read-only buyer browser fixture confirms saved-address checkout enables and
  the address-save action is visible at 320 pixels; no order/payment was created.
- [x] Buyer owner-only order/item/address/payment access has SQL regression coverage.
- [x] Broken snapshot media cannot hide authorized order information.
- [x] Payment/expiry states and manual shipment display retain existing tests.
- [ ] Real hosted refresh/relogin/private-media behavior after coordinated migration deployment.
- [ ] Live auction bidding/winner-only checkout acceptance after approved deployment.

Cancellation behavior is deliberately bounded: trusted unpaid-reservation expiry
cancels and preserves history. There is no new buyer self-service paid cancellation,
automated refund or restock workflow in this release. Do not claim otherwise.

## Seller/admin checklist

- [x] Seller application/approval, draft edit/delete/submit and trusted publication tests retained.
- [x] Private image upload/retry/cancel/cleanup and owner inventory protection retained.
- [x] Unrelated seller/buyer access and forged roles tested in isolated SQL.
- [x] Seller incoming orders and TEST no-dispatch display exercised locally.
- [x] ADMIN/SUPER_ADMIN entry and buyer/seller redirects exercised in a browser.
- [x] Moderation/audit and server-only role transitions retain regression coverage.
- [x] Weekly review UI is connected to the auction admin interface.
- [x] Selection scheduling creates one event with intended lots atomically in SQL fixtures.
- [ ] Real multi-connection lock contention and native background jobs verified on disposable staging.

## Physical Android AR acceptance — pending

Use a supported ARCore Android Chrome device (OnePlus 8T where available). No
physical-device PASS is claimed by Module 09. Follow the exact setup/secure-origin
instructions in [AR Gallery](AR_GALLERY.md); no public tunnel/deployment is approved.

1. Confirm HTTPS/approved localhost development origin, compatible Chrome and
   updated Google Play Services for AR; unsupported devices show the honest fallback.
2. Open two published artworks, including portrait/landscape. Confirm image/model
   match, correct aspect ratio and **estimated** dimensions (never camera-measured).
3. Exercise all frame variants and 3D preview; try failed/missing/revoked model access.
4. Explicitly start camera AR; test granted and denied permission. Scan a wall,
   reticle/readiness and placement; do not assume optional plane/light/anchors support.
5. Reposition, use min/max/slider/100% controls, Lock Position. Confirm drag,
   resize and accidental touch cannot change placement while locked.
6. Unlock, reposition/rescale and relock repeatedly. Verify native-anchor fallback
   messaging; do not expect persistent placement across sessions.
7. Interrupt tracking, cover camera briefly, background/return, rotate phone,
   exit/re-enter AR, browser back and reopen. Confirm cleanup/camera release.
8. Test slow/offline asset access, retries and repeated entry for memory/thermal
   degradation. Record device/OS/browser versions and observed failures.

## Known limitations and non-goals

- No hosted acceptance of pending Modules 05–07; no native Docker/Postgres or
  physical camera execution in this QA run.
- AR proof assets are development infrastructure. Production AR delivery remains
  a release blocker for a claim of production AR support.
- FAQ and metadata ranking are explicitly heuristic; no real vision/LLM execution
  or artistic authenticity scoring is claimed.
- No LIVE payments, UPI/QR, wallet, real courier API, automatic refund/restock,
  social messaging, reviews or notification-center expansion. Existing disabled
  future affordances remain honest; original multi-module mockups do not expand V1.
- No immutable full-session recommendation snapshot; current availability and
  engagement may change ranking during pagination. Existing client dedupe applies.
- No load-test/SLA, exhaustive accessibility audit or guaranteed AR tracking quality.

## College demonstration readiness

- [ ] Owner reviews current uncommitted changes and the exact verification report.
- [ ] Prepare approved demo accounts for CUSTOMER, SELLER and ADMIN with no secrets
  shown in slides, terminal, browser devtools or recordings.
- [ ] Explain normalized database/RLS/protected roles, atomic checkout and exactly-once
  payment settlement using fixtures or existing accepted TEST evidence.
- [ ] Demonstrate current public/guest routes and FAQ/heuristic labels honestly.
- [ ] Show a local isolated five-lot selection run and admin approval; distinguish
  recommendations from auction selection and avoid claiming hosted automation.
- [ ] Use a physically accepted Android device for AR, or state the acceptance gap
  and show the tested 3D/unsupported fallback without pretending it is camera AR.
- [ ] If demonstrating hosted auctions/chat history, complete approved deployment
  and smoke checks first. No fake provider success or privileged browser shortcuts.
