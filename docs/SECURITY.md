# ArtVault — Security Architecture

**Status: foundation + authentication + customer account.** Module 00
shipped a deny-by-default rules skeleton. Module 01 added the first real
rule, the first Cloud Function, and the real role model described below.
Module 03 hardens that rule into a genuine field-level allow-list for
customer profile self-service edits.

## Implemented in Module 03

- **`users/{uid}` update rule is now a real field-level allow-list, not
  just an identity check.** A client-issued update (via `updateDoc()` *or*
  a full-document `setDoc()` overwrite — Firestore rules treat both
  identically once the document exists) may only change
  `displayName`, `phoneNumber`, `bio`, `profileCompleted`, and `updatedAt`.
  This is enforced via `request.resource.data.diff(resource.data)
  .affectedKeys().hasOnly([...])` in `firestore.rules` — any request that
  touches an unlisted field (a new privileged key like `isAdmin`, or an
  existing protected one like `role`) is rejected outright, independent of
  the existing `uid == uid && email == email && role == role && createdAt
  == createdAt` identity check that was already in place from Module 01.
  `photoURL` was added to the protected set in Module 03: no avatar-upload
  feature exists yet, so the rule grants no write capability the app
  doesn't actually use.
- **Schema validation lives in the rule itself, not only in the client's
  Zod schema.** `displayName` must be a 2-60 character string,
  `phoneNumber`/`bio` must be strings within their length caps (or `null`),
  and `profileCompleted` must be a boolean — a request that skips the
  client (a hand-crafted write against the SDK) is still rejected by the
  same constraints the UI enforces.
  `updatedAt` must equal `request.time`, meaning it must be a genuine
  `serverTimestamp()` sentinel — a client cannot backdate or forge it.
- **`profileCompleted` is explicitly documented and enforced as UX metadata
  only.** The rule checks its type (`bool`) but never uses its value to
  gate access to anything — it must never become a security control by
  accident in a later module.
- **Verified against the real Firebase Local Emulator Suite**, not just
  read from the rules file — see `firestore-tests/users.rules.test.ts`
  (21 tests) and ARTVAULT_PROJECT_STATE.md's Module 03 entry for the full
  run.

## Implemented in Module 01

- **Role-based access:** `CUSTOMER | SELLER | ADMIN | SUPER_ADMIN` as a
  Firebase Auth **custom claim**, set only by `functions/src/index.ts`'s
  `onUserCreate` trigger (Admin SDK) — every new user is assigned
  `CUSTOMER` by default. The claim is the sole security authority read by
  the frontend (`getIdTokenResult(user).claims.role`, never a client-side
  variable); the mirrored `users/{uid}.role` Firestore field exists only
  for convenient reads and is never trusted by a rule or function.
- **`ADMIN`/`SUPER_ADMIN` have no self-service or in-app path at all.** The
  only way either is ever granted is `functions/src/setAdminClaim.ts` — a
  standalone script run locally by a human holding Admin SDK credentials
  (emulator env vars, or a production service-account key that is never
  committed). No deployed, client-reachable function can grant these
  roles.
- **`users/{uid}` Firestore rule:** a client can never `create` this
  document (only the Admin SDK trigger can); a client `update` is only
  allowed if `uid`, `email`, `role`, and `createdAt` are all unchanged from
  the existing document — role escalation from the client is structurally
  impossible, enforced by the rule itself, not just by convention. See
  `firestore.rules` and `docs/DATABASE.md`.
- **Session persistence:** the Firebase Auth SDK's `browserLocalPersistence`
  is set explicitly (rather than left as an implicit default) so a session
  survives a refresh/restart; `AuthProvider` exposes an explicit `loading`
  status while that restoration is in flight, so guarded routes never
  flash an incorrect signed-out state.

## Baseline established in Module 00

- `firestore.rules` and `storage.rules` deny all reads and writes by
  default. Every later feature module adds its own explicit, narrowly
  scoped rules — nothing is ever opened broadly "to unblock a feature."
- No secret or API key lives in any frontend-reachable file. The Firebase
  **client** config values (`VITE_FIREBASE_*`) are not treated as secrets —
  they are safe to ship to the browser per Firebase's own model, because
  Firestore/Storage/Auth security is enforced by rules, not by hiding the
  config. Genuine secrets (payment provider keys, AI provider keys) will
  live only in Cloud Functions config/Secret Manager when those modules are
  built — never in `.env`, never in the client bundle.
- `.env.example` ships only demo/placeholder values that work against the
  Local Emulator Suite; no real credential is committed anywhere.

## Planned (not yet implemented)

- Sellers are not restricted from buying — role gating only restricts
  seller-studio and admin surfaces; cart/checkout rules are open to any
  authenticated user regardless of role.
- Every privileged write goes through a Cloud Function that re-validates
  the caller's custom claim server-side — Firestore rules are the first
  gate, the function is the second, independent check.
- App Check (reCAPTCHA v3, free tier) is planned to reduce scripted abuse
  of public endpoints once there are real endpoints to protect.
- `auditLogs` will be append-only and written exclusively by Cloud
  Functions, never directly by a client.
- Bidder identity in auctions is never exposed publicly — see
  `docs/DATABASE.md` for the public/private bid projection design.
- **Content-Security-Policy:** ArtVault does not define a CSP of its own
  yet (no `<meta http-equiv="Content-Security-Policy">`, no Hosting
  `headers` config). A real production CSP — script/style/connect-src
  scoped to Firebase and whichever AI/payment/search hosts are eventually
  chosen, with no `unsafe-eval` — is planned before production deployment,
  not before. See `ARTVAULT_PROJECT_STATE.md` → Security issues for a
  currently-open investigation item: a CSP "blocks eval" warning observed
  during local browser smoke testing, confirmed to originate outside
  ArtVault's own code (no CSP exists in the app to have blocked anything).
