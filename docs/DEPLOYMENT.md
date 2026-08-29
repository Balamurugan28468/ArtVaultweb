# ArtVault — Deployment & Cost Strategy

## Local development: fully local, ₹0, no Firebase project required

This project's Firebase project ID is `demo-artvault` (see `.firebaserc`).
A `demo-`-prefixed project ID is treated specially by the Firebase Local
Emulator Suite: **it requires no real Firebase project to exist at all.**
Local development runs entirely against the emulators with no account
signup, no billing, and no real cloud resource.

To run the emulators locally (not yet exercised in Module 00, but
configured and ready):

```bash
npx firebase-tools emulators:start
```

- Requires a Java Runtime Environment (JRE 11+) installed locally — the
  Firestore emulator depends on it. This is the one manual prerequisite
  for running emulators; nothing else needs installing or signing up for.
- Ports: Auth `9099`, Firestore `8080`, Storage `9199`, Emulator UI `4000`
  (see `firebase.json`).
- The app connects to these automatically in dev (`VITE_USE_FIREBASE_EMULATORS=true`
  by default — see `.env.example` and `src/lib/firebase/config.ts`).

## Cost strategy: usage quota vs. billing plan (important distinction)

| Service | Requires Blaze (paid) billing plan enabled? | Free usage quota exists? |
|---|---|---|
| Firestore (Native mode) | No — usable on Spark | Yes |
| Firebase Auth | No — usable on Spark | Yes |
| Firebase Hosting | No — usable on Spark | Yes |
| **Cloud Storage for Firebase** | **Yes** | Yes, but only reachable once Blaze is enabled |
| **Cloud Functions** | **Yes** | Yes, but only reachable once Blaze is enabled |
| Cloud Scheduler (auction close jobs) | Yes | Small free quota |
| Local Emulator Suite (all of the above) | **No — fully local** | N/A |

Enabling Blaze means adding a payment method to the Firebase project. It
does **not** by itself mean charges will occur — free-tier usage quotas
still apply on top of it — but the plan itself is a real prerequisite for
deploying Storage or Cloud Functions for real use, not just a formality.

**Blaze will not be enabled, and no paid resource or third-party service
will be created, without explicit owner approval at the point a module
actually needs it.**

## Deferred until their respective modules

- **Cloud Functions runtime:** Node 20 or Node 22, chosen deliberately
  when Functions are first initialized, with the choice and rationale
  recorded in `ARTVAULT_PROJECT_STATE.md`.
- **Payment provider:** selection, current regional availability, and
  current fee structure are all verified inside the payment module, not
  assumed now. Sandbox/test mode is used first regardless of provider. An
  order is never marked paid from client-reported state — only a
  backend-verified webhook/callback can do that.
- **AI provider:** see `docs/AI_ARCHITECTURE.md`.
- **Search provider:** see `docs/ARCHITECTURE.md` ("Search").
- **Production hosting deploy:** not performed in Module 00. When it
  happens, this file will be updated with the exact `firebase deploy`
  commands and CI wiring used.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs install, typecheck, lint,
unit tests, and build on every push/PR. It needs no secrets and creates no
paid resource — the app's env schema falls back to emulator-safe demo
values, so CI is self-contained.
