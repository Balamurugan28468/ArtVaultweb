# Firebase persistence and admin moderation incident - 2026-09-18

## Confirmed failure and limits of the evidence

The live Functions registry was empty after two 10-second discovery timeouts.
A legitimate, Admin-SDK-verified emulator ADMIN ID token calling
`demo-artvault/us-central1/moderateArtwork` received HTTP 404, with an empty
valid-functions list. The request never reached moderation business logic.
The frontend generic error was consistent with this missing callable/router response.

The later unexpected shutdown exported successfully at 19:06 IST. Its initiating
process/signal could not be established from available Windows/VS Code logs.
No evidence established an OOM kill. Firebase CLI normally deletes its debug log
on ordinary exit unless DEBUG is enabled. Do not infer a known shutdown actor.

Owner accepted the validated 13-Auth/14-artwork snapshot as the new baseline;
reconstruction of earlier published records was explicitly discontinued.

## Infrastructure changes

- Build Functions once before the watcher starts; reconciliation uses compiled code.
- Allow 60 seconds for Functions discovery, then verify the real registry. At most
  one bounded discovery reload; no automatic data-emulator termination.
- Verify Auth, Firestore and Storage reads before declaring ARTVAULT READY.
- Resolve installed Firebase CLI JavaScript directly, bypassing the failing Windows
  npx shim. No automatic CLI download.
- Retain per-session logs and CLI debug logs, including checkpoint CLI runs.
- Retain every snapshot; import newest validated complete generation, fail closed
  on newer unconfirmed exports. Auth/Firestore/Storage stay together.
- Seal the completed shutdown export before any slow post-exit diagnostics.
  Startup still refuses orphan/occupied emulator processes.

## Supported operation

Start with `npm.cmd run emulators`; wait for `ARTVAULT READY`.
Stop writes before checkpointing: `npm.cmd run checkpoint:emulators -- --quiescent`.
For shutdown, press Ctrl+C once and wait for `SNAPSHOT SAVED` before closing the
terminal or answering a Windows batch termination prompt. A force-kill/terminal
close can still lose changes after the last checkpoint; no crash-proof guarantee.
`npm.cmd run verify:emulator-state` is read-only.

One Windows batch-prompt interruption ended the wrapper after Firebase had
exported and exited code 0, but before the validation seal was written. Startup
correctly refused silent fallback. The retained export was reviewed against the
session evidence, fully validated and finalized through `publishSnapshot`;
no database payload file was manually changed. An additional clean restart completed with SNAPSHOT SAVED and launcher exit 0;
the reviewed recovery itself is not counted as an uninterrupted wrapper exit.

## Controlled owner artwork

`GUskLIMFWAPA9hHN7gvY` - Emberwing: Rise of the Eternal Phoenix.
SUBMITTED -> PUBLISHED via authenticated ADMIN callable, HTTP 200.
First call cold-started in approximately 40 seconds.
Auth ADMIN UID: `36YGTvLyE2gjspQ7l8iwEH3ON27c`.
Its existing users/{uid}.role mirror is CUSTOMER; trusted Auth claim is ADMIN.
The mirror was not rewritten and authorization was not weakened.

Private local evidence is retained under ignored `moderation-incident.local/`:
full document captures, Auth identity/claim comparisons, Storage byte hashes,
browser screenshots, HTTP results and test outputs. No Auth ID tokens are saved in reports.

Initial browser loads intermittently displayed empty results while the same
application repository query returned the published artwork. Fresh Chrome loads
succeeded. This latency/cache symptom is recorded, not presented as snapshot loss
or silently fixed by changing marketplace source. Node 24 host versus requested
Node 22 runtime and SDK metadata/NPM lookup warnings remain visible limitations.

## Final verification

Three initial restart comparisons restored the identical full Firestore payload,
Auth UID/email/disabled/claim state and Storage object bytes. Auth login timestamps
are not asserted immutable: legitimate token exchanges update them.
All three kept GUskLIMFWAPA9hHN7gvY PUBLISHED before and after restart and visible
in Chrome on fresh load. Earlier cold browser attempts timed out; see below.

| Import | Snapshot generation | Result |
|---|---|---|
| Restart 1 | c54483043e0b9592ae826e4f076f6bc7f55be1e615f2b4b5342b17c1f14f42d2 | Identical payload; PUBLISHED; visible |
| Restart 2 | 883f3153600e246a6327d44bd50b8f854e3c890bc95a4eb602b0ad9780c02ffa | Identical payload; PUBLISHED; visible |
| Restart 3 (reviewed completion seal) | 5b082e467fc61a8b999cd927dd661d943f2bef3590b20c62b4d66f120ba6689c | Identical payload; PUBLISHED; visible |
| Extra clean restart | 46b82a7750e2a37cf4e46737d972d7f44e34aa2612754a383d43d667dcbd78ad | Identical payload; PUBLISHED; visible |
| Final cold-start readiness verification | 96c80c2232fd34acc521bc9a8a5ead39a77f7f9fd125d9a8b1dfcfcc9aa49cf3 | Intended fixture state identical; first Chrome load passed |

The first four captures share payload hash
9861c5293ac326066fce39df31bb27b0a842d10081f4d74e538ac128387acc55.
After the intentional test additions, before/after final restart share
3487aca550db2bb1c1d467c7213f62dc97041629acbea6bf19256e284342c5f3.

The cold browser symptom was captured explicitly: Firestore web SDK failed its
first backend connection within 10 seconds, then served empty offline cache.
The launcher now performs the same anonymous marketplace query using
getDocsFromServer, retries boundedly, rejects cache results, and refuses readiness
if published records exist but the public query returns none. This changes only
development infrastructure. On the final cold restart the server query returned
one published artwork, readiness was logged, and the first Chrome 153.0.8010.48
load displayed Emberwing without the offline warning or a retry.

All seven HTTPS callables remained registered: moderateArtwork, suspendArtwork,
approveSellerApplication, rejectSellerApplication, createCheckoutOrder,
setArtworkInventory, expireCheckoutReservations. onUserCreate was registered too.
No commerce callable was invoked.

Live Reject and Suspend returned HTTP 200. reviewedAt, updatedAt and reason were
verified. Suspend wrote one correct adminLogs record. Existing Publish/Reject
business logic does not write adminLogs; this pre-existing limitation was not
changed. Duplicate Publish/Reject/Suspend returned HTTP 400 / FAILED_PRECONDITION
and changed no artwork fields or audit counts. Signed-out was 401, CUSTOMER and
SELLER were 403, including forged client role ADMIN. Trusted claims were preserved.

Counts before publication: Auth 13, users 7, sellers 2, artworks 14, published 0,
Storage 13, orders 0, reservations 0.
Across initial restart cycles: same, except published 1.
Final: Auth 13, users 7, sellers 2, artworks 17, published 1, Storage 13, orders 0,
reservations 0. The three additions are labelled zero-stock local test records:
incident-local-20260918-reject (REJECTED), incident-local-20260918-suspend
(SUSPENDED), incident-local-20260918-owner-review (SUBMITTED for owner review).
They reuse existing image references; no Storage object was added or changed.
Every original Firestore document matches the published baseline. Only these
three documents and adminLogs/qamntF7pabn7TC8RtCUq were added afterward.

Validated checkpoint after moderation:
1789744778072-checkpoint-3c9069e2-e504-497d-a4d9-269e24c9b857,
generation 0ad3fb1312214ce55fdfb93633a10f55447007ebd11e1d55bdd3ed057a23cdc9.
Current import: firebase-export-snapshots/1789744105949-shutdown-91960794-955f-47db-95ec-f0e07f666325
(timestamp 2026-09-18T15:21:11.603Z), generation 96c80c22...aa49cf3 above.
All previous generations remain retained. Vite processes were left untouched;
these were actual Firebase restarts, not a claim of a separate Vite-only restart.

Verification: 143 infrastructure tests (10 files); 200 Functions tests (10 files),
including 127 focused moderation tests; 78 admin frontend tests (9 files).
Typecheck, lint and production build passed. Lint retains React warnings; build
retains its large-chunk warning. Latest infrastructure additions passed lint and
script tests; no frontend/Functions business code changed. No tests weakened.
Original unexpected shutdown initiator remains unknown; durable logging improves
future evidence. Node 24/22 mismatch and metadata/NPM lookup warnings remain.

Owner retest: wait for ARTVAULT READY, reload /explore, confirm Emberwing, then use
/admin with the existing ADMIN account. The labelled owner-review record is
SUBMITTED; publish it, then suspend it if desired. Reject needs a separate
SUBMITTED record, since rejecting an already-published artwork is intentionally
denied. Close app writes, checkpoint with --quiescent, and use Ctrl+C once; wait
for SNAPSHOT SAVED before closing/responding to the terminal prompt.

Nothing committed, staged or pushed. Existing AR, commerce, UI, Firebase rules
and configuration changes are preserved byte-for-byte from incident baseline.

