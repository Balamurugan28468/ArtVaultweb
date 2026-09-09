/**
 * One-off operator script — NOT a deployed function, NOT reachable by any
 * client or callable endpoint. Same trusted-script family as
 * promoteSeller.ts/publishArtwork.ts/reconcileRoles.ts/
 * repairMissingProfile.ts. Backfills the Module 12 (Likes) `likeCount`
 * field onto every pre-existing artworks/{artworkId} document that was
 * created before that field existed — confirmed by direct emulator
 * inspection that all 3 real artwork documents at the time of writing
 * genuinely lack it entirely (not `0`, not `null` — absent).
 *
 * Defaults to a dry run: computes and returns the exact same report a real
 * run would, but never writes anything unless `apply: true` is passed
 * (the CLI entrypoint requires an explicit `--apply` flag for this reason —
 * an accidental bare invocation can never mutate data). Touches `likeCount`
 * alone on any document it writes to — never `title`, `description`,
 * `price`, `category`, `tags`, `images`, `inventoryCount`, `sellerId`,
 * `status`, `createdAt`/`updatedAt`, or any other field; ownership,
 * publication state, and every other artwork property are left completely
 * untouched, via a scoped `update()` naming only `likeCount`, never a
 * full-document overwrite.
 *
 * Idempotent by construction: a document whose `likeCount` is already a
 * valid non-negative integer is left untouched (`already-valid`), so a
 * second run — including one against a project this script has already
 * been applied to — performs zero writes. A malformed existing value
 * (non-numeric, negative, or non-integer) is never silently "fixed" —
 * it's reported, and if `apply: true` encounters even one, the *entire*
 * run is aborted before any write happens, on the theory that data
 * inconsistent enough to be malformed deserves a human looking at
 * everything before anything is written, not a partial best-effort apply.
 *
 * Local (emulator) usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run backfill-like-count           (dry run)
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run backfill-like-count -- --apply (writes)
 *
 * Production usage (run only by the project owner, never committed):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npm run backfill-like-count -- --apply
 */
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore'

export interface BackfillItemResult {
  id: string
  status: unknown
  action: 'would-set-zero' | 'set-to-zero' | 'already-valid' | 'malformed'
  existingValue?: unknown
}

function isValidLikeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export class BackfillAbortedError extends Error {
  constructor(public readonly malformed: BackfillItemResult[]) {
    super(
      `Aborted — ${malformed.length} artwork document(s) have a malformed likeCount value and were ` +
        `not touched. Zero writes were performed. Resolve these manually, then re-run:\n` +
        malformed.map((m) => `  ${m.id} (status=${String(m.status)}): ${JSON.stringify(m.existingValue)}`).join('\n'),
    )
    this.name = 'BackfillAbortedError'
  }
}

/**
 * `apply: false` (the default the CLI uses without `--apply`) never calls
 * `.update()` — every branch below that would write is skipped, and the
 * function still returns the exact report a real apply run would report,
 * so a dry run's output is a true preview, not a different code path.
 */
export async function backfillLikeCount({ apply }: { apply: boolean }): Promise<BackfillItemResult[]> {
  const db = getFirestore()
  const snapshot = await db.collectionGroup('artworks').get()

  const results: BackfillItemResult[] = []
  const malformed: BackfillItemResult[] = []
  const toWrite: QueryDocumentSnapshot[] = []

  for (const doc of snapshot.docs) {
    const data = doc.data()
    const status = data.status

    if (!Object.prototype.hasOwnProperty.call(data, 'likeCount')) {
      results.push({ id: doc.id, status, action: apply ? 'set-to-zero' : 'would-set-zero' })
      toWrite.push(doc)
      continue
    }

    if (isValidLikeCount(data.likeCount)) {
      results.push({ id: doc.id, status, action: 'already-valid' })
      continue
    }

    const item: BackfillItemResult = { id: doc.id, status, action: 'malformed', existingValue: data.likeCount }
    malformed.push(item)
    results.push(item)
  }

  if (apply && malformed.length > 0) {
    throw new BackfillAbortedError(malformed)
  }

  if (apply) {
    for (const doc of toWrite) {
      await doc.ref.update({ likeCount: 0 })
    }
  }

  return results
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')

  initializeApp()
  const results = await backfillLikeCount({ apply })

  const byAction = { 'would-set-zero': 0, 'set-to-zero': 0, 'already-valid': 0, malformed: 0 }
  for (const result of results) {
    byAction[result.action] += 1
    const detail = result.action === 'malformed' ? ` existingValue=${JSON.stringify(result.existingValue)}` : ''
    console.log(`${result.id} status=${String(result.status)} action=${result.action}${detail}`)
  }

  console.log(
    `\n${apply ? 'APPLY' : 'DRY RUN'} — scanned ${results.length} artwork document(s): ` +
      `${byAction['already-valid']} already valid, ` +
      `${byAction['would-set-zero'] + byAction['set-to-zero']} ${apply ? 'set to' : 'would be set to'} likeCount: 0, ` +
      `${byAction.malformed} malformed (not touched).`,
  )
  if (!apply && byAction['would-set-zero'] + byAction['set-to-zero'] + byAction.malformed > 0) {
    console.log('Re-run with -- --apply to write. Nothing has been written.')
  }
}

// Importing this module (e.g. from its own test file) must never trigger a
// real CLI run as a side effect — see the identical guard in
// promoteSeller.ts/reconcileRoles.ts/repairMissingProfile.ts.
if (require.main === module) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
