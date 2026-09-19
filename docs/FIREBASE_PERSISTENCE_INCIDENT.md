# Firebase persistence incident — 18 September 2026

**Stale snapshot import confirmed. Missing published state not recovered. The
incident is NOT resolved and real restart acceptance tests have NOT passed.**

No owner records were changed, created, republished, restored, cleared or exported
during this investigation. No existing snapshot/backup was renamed or overwritten.
The running legacy emulator and Vite processes were not stopped. All AR/commerce
source changes were preserved. Only the shared package.json diagnostic command
changed; its existing AR dependencies/scripts remain intact.

## Current live state

Read from demo-artvault on localhost using explicitly emulator-bound Admin SDK
reads. Auth pagination is included; no reconciliation or writes are performed.

| Entity | Count |
|---|---:|
| Auth accounts | 13 |
| Auth ADMIN / SELLER / CUSTOMER claims | 1 / 7 / 5 |
| Firestore users | 7 |
| Seller records | 2 |
| Artworks | 14 |
| PUBLISHED | 0 |
| SUBMITTED / REJECTED / SUSPENDED | 12 / 1 / 1 |
| Orders | 0 |
| Reservation collection records / active order reservations / reserved units | 0 / 0 / 0 |

The empty marketplace is consistent with the stored moderation states. The
artwork documents themselves are present. No manual republishing was performed.

## Snapshot inventory

All paths below are relative to
`C:\Users\bm440\Desktop\ARTVAULT_WEB\artvault`. Times are IST, UTC+05:30.

| Directory | Directory modified | Export metadata modified | Auth | Artworks | PUBLISHED | Auth seller/admin accounts |
|---|---|---|---:|---:|---:|---|
| `emulator-data` | Sep 17 22:18:08 | Sep 17 05:51:52 | 13 | 14 | 0 | 7 sellers, 1 admin |
| `emulator-data.backup` | Sep 18 18:15:40 | Sep 17 05:51:52 | 13 | 14 | 0 | 7 sellers, 1 admin |
| `emulator-export-safe-20260905-193731` | Sep 5 19:37:38 | Sep 5 19:37:38 | 10 | 1 DRAFT | 0 | 5 sellers, no admin |

All three contain Auth export, Firestore export, and Storage bucket metadata.
The two recent directories contain the same complete set of payload bytes. Their
Firestore document shard has SHA256
`84a0407afe25482e8b954bcfb015f28a5b6c37772d29aad331d5da9434347fe8`.
Their Auth accounts SHA256 is
`68984681d7356cda99d9a8909a3c7320bf843d9ed864243116000ad0f20d2555`.
Each snapshot was inspected as a whole generation, never mixing Auth and Firestore.
The original legacy manifest does not hash the Firestore document shard, so it
cannot independently establish historical payload integrity or capture provenance.

Search covered the project/workspace, Desktop, Documents, Downloads, OneDrive,
and Firebase/artvault/emulator-named temporary directories. No additional
checkpoint or firebase-export staging directory containing a recoverable published
generation was found. This does not prove no external/off-machine backup exists.
No snapshot with the expected 12+ PUBLISHED records was found.

Detailed forensic hashes, timestamps, document summaries and the original logs are
preserved under ignored `incident.local/`. These artifacts may contain private
local account data and must not be committed.

## Import evidence and root cause

The startup log at `2026-09-18T12:46:03.952Z` (18:16:03 IST) records:

```
firebase emulators:start --import=./emulator-data --export-on-exit=./emulator-data
```

The next Firestore import line names the absolute canonical
`emulator-data/firestore_export/firestore_export.overall_export_metadata` path.
The imported export metadata is from Sep 17 05:51:52 IST. Its Firestore shard is
from 05:51:50.134 and Auth payload from 05:51:50.524. Their states match the live
14-artwork, zero-published state.

The manifest was rewritten at Sep 17 22:18:08 while those payloads remained old.
The old launcher's exit handler wrote a manifest whenever the canonical directory
looked complete, without requiring a successful fresh export from that session.
Thus a fresh manifest/directory timestamp was not evidence of saved recent work.
Startup then unconditionally deleted the rolling backup and copied canonical data
into it. Today's backup is therefore the same old data, not a second newer recovery
point. This explains the observable stale-state restart and misleading recency.

Retained logs contain no completed owner export after publication. They do not
establish exactly which terminal-close, crash, forced-stop, or export-failure event
prevented publication changes from being saved. A current Windows file-lock failure
is NOT proven. Do not attribute this incident to Vite solely because an older lock
incident is documented in the repository.

Other confirmed implementation defects:

- Startup scanned only numeric `firebase-export-*` names, excluding checkpoint
  staging; it did not select a newer rolling backup.
- Metadata-file existence, rather than complete validation, decided import mode.
- Canonical export replacement relied on Firebase removing/replacing an existing
  directory. A failed replacement could leave staging data.
- Legacy integrity checks covered Auth and metadata but not document/blob payloads.
- Checkpointing reused one staging directory, deleted failed candidates, and deleted
  the previous backup during promotion.
- The old checkpoint comment incorrectly described a cross-service atomic capture.
  Installed firebase-tools 15.28.2 `hubExport.js` exports Firestore, then Auth, then
  Storage sequentially. Writes must be quiescent; atomic pointer replacement is a
  separate filesystem guarantee.
- Root `verify:emulator-state` compiled Functions and invoked a diagnostic that did
  not itself bind to emulator endpoints, lacked published/order/reservation counts,
  and read canonical provenance even if another snapshot had been imported.

Firebase documents export-on-exit as a shutdown mechanism; it is not continuous
durability: https://firebase.google.com/docs/emulator-suite/install_and_configure

## Infrastructure changes

Exact files changed for this incident:

1. `package.json` — only the diagnostic command; no dependency changes.
2. `scripts/start-emulators.mjs` — validate/select newest generation, log counts,
   import that exact directory, exclusive launcher lock, refuse automatic orphan
   termination at startup, export shutdown to a unique NEW directory, confirm a
   successful clean export before publication. Retain all historical directories.
3. `scripts/checkpoint-emulators.mjs` — unique export directory, checkpoint lock,
   explicit `--quiescent` requirement, before/after live fingerprints, exported/live
   count checks, fail without deleting candidates or replacing old data.
4. `scripts/lib/firestoreExport.mjs` — read-only emulator-format decoder, CRC32C,
   protobuf/log fragmentation validation.
5. `scripts/lib/emulatorSnapshot.mjs` — validate Auth/Firestore/Storage, shard lists
   and document totals, blob hashes, full-payload SHA256 seal, candidate selection,
   fsynced temporary pointer followed by atomic rename.
6. `scripts/lib/emulatorSnapshot.test.mjs` — payload, selection, retention tests.
7. `scripts/lib/readEmulatorState.mjs` — emulator-only paginated reads, optional
   fingerprint, provenance with legacy-log fallback explicitly labelled.
8. `scripts/lib/readEmulatorState.test.mjs` — active/stale/unknown provenance tests.
9. `scripts/verify-emulator-state.mjs` — read-only diagnostic entry point.
10. `docs/FIREBASE_PERSISTENCE_INCIDENT.md` — this report and operating procedure.

The new generation store is `firebase-export-snapshots/`, already ignored by Git
and the existing Vite watcher pattern. Existing `emulator-data`, backup and safe
exports stay untouched. `current.json` is a replaceable pointer, not the data.
Startup scans generations independently, so a stranded newer valid generation
cannot silently be hidden by a stale pointer. New/unconfirmed exports, newer
incomplete candidates and conflicting equal-time generations block startup.
Unsupported Firestore export versions fail closed (decoder currently supports
the installed 1.22.0 format).

No existing owner snapshot was sealed, promoted, exported, or imported by this
investigation. The currently running launcher retains its OLD code in memory.

## Supported procedure after incident recovery is authorized

1. Identify and validate a real healthy snapshot as one whole Auth + Firestore +
   Storage generation. If none exists, report that; never fabricate publication.
2. Close app tabs and stop operator writes. Preserve all current on-disk generations
   by verified copies to a new incident backup; separately capture live state to a
   new uniquely named export, without overwriting any existing path. Owner approval
   is required before proceeding with the current legacy session's shutdown because
   it is still configured to overwrite canonical data on exit.
3. Keep a verified copy of the healthy candidate, validate all components and hashes,
   and select it as an entire generation. Never merge service directories. Retain
   the current state and recovery source. If an older healthy candidate must replace
   a newer unhealthy one, use an explicit reviewed recovery choice; do not falsify
   timestamps or let automatic newest-selection decide this conflict.
4. Start `npm.cmd run emulators`. Review import path, timestamp, counts and warnings.
   Then start `npm.cmd run dev` and verify the real records in the marketplace.
5. Read-only health check: `npm.cmd run verify:emulator-state`.
6. To checkpoint, close app tabs and pause all writes; run
   `npm.cmd run checkpoint:emulators -- --quiescent`. Wait for `SNAPSHOT SAVED`.
   The flag is an operator assertion, not a database write lock. Before/after
   fingerprints detect intervening changes, but no cross-service transactional
   snapshot guarantee is claimed.
7. For shutdown, stop using the application; press Ctrl+C ONCE in the emulator
   terminal and wait for `SNAPSHOT SAVED` and process exit. Do not close the terminal
   or VS Code while export is running. Checkpoint at meaningful milestones: a crash
   can still lose changes made after the most recent confirmed snapshot.

| Exit/restart action | Durability expectation |
|---|---|
| Vite-only restart | Does not save or stop Firebase; live records should remain |
| Emulator Ctrl+C and wait | New validated generation required before reporting success |
| Terminal/VS Code close | Export completion cannot be guaranteed |
| Crash/force kill | Unsaved in-memory changes may be lost; retained generations survive |
| Incomplete/failed export | Retain candidate and all prior generations; refuse silent fallback |

## Verification and remaining blockers

132 script tests passed (6 files, one worker), including 19 new persistence and
provenance tests. Typecheck and lint passed (existing React warnings remain).
Production build passed with chunk-size/plugin-timing warnings. The live diagnostic
also emits an SDK metadata-lookup warning but completes successfully against the
explicit local emulator endpoints.
The diagnostic was exercised against the real running emulator, read-only.
Checksums of the original snapshots and pre-existing source changes are audited
separately in `incident.local/`.

**These tests do not prove real restart durability.** No successful owner-data
restart claim is made. The following acceptance tests remain NOT RUN:

| Required test | Status |
|---|---|
| Combined emulator + Vite restart 1 | Blocked: no PUBLISHED recovery snapshot |
| Combined emulator + Vite restart 2 | Blocked: same |
| Combined emulator + Vite restart 3 | Blocked: same |
| Vite-only restart with published records visible | Blocked: zero published records |
| Emulator-only restart with published records visible | Blocked: recovery and safe legacy-session transition required |

Once a healthy generation is identified and recovery approved: use the actual
published IDs and hashes as the baseline, safely identify an existing state change,
checkpoint, perform each restart, and compare Auth/users/sellers/artworks/PUBLISHED/
orders/reservations plus record identities. Counts alone are insufficient.

No commit, push, feature development, payment integration, or manual republishing.
