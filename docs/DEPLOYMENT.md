# ArtVault — Deployment & Cost Strategy

## Local development: fully local, ₹0, no Firebase project required

This project's Firebase project ID is `demo-artvault` (see `.firebaserc`).
A `demo-`-prefixed project ID is treated specially by the Firebase Local
Emulator Suite: **it requires no real Firebase project to exist at all.**
Local development runs entirely against the emulators with no account
signup, no billing, and no real cloud resource.

To run the emulators locally:

```bash
npm run emulators
```

This wraps `firebase emulators:start` with `scripts/start-emulators.mjs`,
which:

- **Checks the Java runtime before doing anything else** (`java -version`,
  or `%JAVA_HOME%\bin\java` first if `JAVA_HOME` is set) and refuses to
  start — with a clear, actionable error, not a confusing Firebase-internal
  failure — if it's not JDK 21+. See "Permanent Windows Java setup" below
  if you hit this.
- **Auto-detects previously saved local data.** If `./emulator-data/`
  contains a prior export (from a clean shutdown of an earlier session), it
  imports it (`--import=./emulator-data`); otherwise it starts fresh. Either
  way, it always exports back to `./emulator-data` on a clean exit
  (`--export-on-exit=./emulator-data`) — so accounts, profiles, etc. you
  create locally survive across restarts instead of resetting every time.
  **Stop it with Ctrl+C** (not by force-closing the terminal or killing the
  process) so this export actually gets a chance to run — the wrapper
  deliberately waits for Firebase's own graceful shutdown to finish before
  it returns control to your terminal.
- `./emulator-data/` is gitignored — it's local-only test data, never
  committed.

Equivalent to running directly, if you ever need to pass different flags:

```bash
npx firebase-tools emulators:start --only auth,firestore,functions
```

- Ports: Auth `9099`, Firestore `8080`, Storage `9199`, Functions `5001`,
  Emulator UI `4000` (see `firebase.json`).
- The app connects to these automatically in dev (`VITE_USE_FIREBASE_EMULATORS=true`
  by default — see `.env.example` and `src/lib/firebase/config.ts`).
- `functions/` compiles to CommonJS, not ESM — this is required for the
  Functions emulator's local discovery step, which hung indefinitely
  ("Cannot determine backend specification") against an ESM build during
  Module 01 verification. Matches Firebase's own official function
  templates, which default to CommonJS for this exact reason. Even with
  that fix, this specific development machine's Functions emulator cold
  start is sometimes slow enough (compounded by running Vite + the JVM
  Firestore emulator simultaneously) to still hit this same timeout
  intermittently — if `npm run emulators` reports it, it's this known,
  environment-specific flakiness, not a functions code defect; stop it
  (Ctrl+C) and run `npm run emulators` again.

### Permanent Windows Java setup

The Firestore Emulator requires a Java Runtime Environment, JDK 21+.
Windows machines that also have an older Java installed (common — many
installers, IDEs, and legacy apps bundle their own JRE) can end up with
`java` on `PATH` resolving to that older one instead, which
`npm run emulators` now detects and refuses to proceed past rather than
handing you a confusing Firebase-internal error. Fix it once, permanently,
so no terminal session ever needs a temporary workaround again:

1. **Install a JDK 21+** if you don't already have one — [Eclipse Temurin
   (Adoptium)](https://adoptium.net/) is a free, no-account-needed option.
   Note the install directory, e.g.
   `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot` (yours will
   differ — use your own).
2. Open **"Edit environment variables for your account"** (search for it in
   the Start menu — this only changes your own user variables, no admin
   rights needed).
3. Under **User variables**, add or edit `JAVA_HOME` to point at that JDK
   21+ install directory (the folder containing `bin\java.exe` — not the
   `bin` folder itself).
4. Under **User variables**, edit `Path` and add a new entry:
   `%JAVA_HOME%\bin` — then move it **above** any existing Java entries in
   the list (use the "Move Up" button until it's first among them). On a
   machine with several old Java installs, `Path` might currently look like
   `...;C:\Program Files (x86)\Common Files\Oracle\Java\java8path;...;C:\Program
   Files\Java\jre1.8.0_503\bin;...` — `%JAVA_HOME%\bin` needs to come before
   all of those, not just be present somewhere in the list.
5. Click OK/Apply, then **open a brand-new terminal window** — environment
   variable changes never apply to a terminal that was already open.
6. Verify:
   ```bash
   java --version
   where.exe java
   ```
   `java --version` should print `21` (or higher) as the major version. The
   **first** path `where.exe java` lists must be your JDK 21+ install's
   `java.exe` — if an older one is still listed first, `Path` isn't ordered
   correctly yet (repeat step 4).

Once this is done, no `$env:` / `export PATH=...` command is ever needed
again in a fresh terminal — `npm run emulators` picks up the correctly
configured `JAVA_HOME`/`PATH` automatically every time.

### A note on re-exporting over an existing `./emulator-data`

Observed on this development machine (not confirmed as universal): if
another process holds even a brief lock on `./emulator-data` at the exact
moment Firebase tries to replace it with a fresh export — most likely
`npm run dev`'s own file watcher, running against this same project
directory — the rename can fail with `EPERM`. The old export is already
gone by that point (Firebase removes it before writing the new one), but no
data is lost: the newly exported data is left sitting in a sibling
`firebase-export-<timestamp><random>/` directory instead of at
`./emulator-data`. `npm run emulators` detects this automatically on its
next startup/shutdown and recovers it into `./emulator-data` for you,
printing what it did; if you ever see a stray `firebase-export-*` folder
sitting in the project root that the launcher didn't clean up on its own,
it's safe — rename it to `emulator-data` yourself (never delete it without
checking first).

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
