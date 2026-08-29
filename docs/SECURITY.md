# ArtVault — Security Architecture

**Status: foundation only.** This module ships a deny-by-default rules
skeleton; no real rule, Cloud Function, or role check is implemented yet.

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

- **Role-based access:** `CUSTOMER | SELLER | ADMIN | SUPER_ADMIN` as a
  Firebase Auth **custom claim**, set only by a Cloud Function using the
  Admin SDK. The claim is the sole security authority; a mirrored
  `users/{uid}.role` field exists only for convenient reads and is never
  trusted by a rule or function.
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
