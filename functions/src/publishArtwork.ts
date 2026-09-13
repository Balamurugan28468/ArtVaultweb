/**
 * One-off operator script — NOT a deployed function, NOT reachable by any
 * client or callable endpoint on its own. `decideArtworkByArtworkId` is the
 * only way a SUBMITTED artwork ever becomes PUBLISHED or REJECTED; there is
 * deliberately no self-service or in-app-by-the-seller path (mirrors
 * exactly how seller approval already works — see promoteSeller.ts). It
 * performs no authorization check of its own — every caller (this file's
 * own CLI `main()`, or Module 13's `moderateArtwork` callable in
 * adminActions.ts) MUST authorize the caller itself before invoking it.
 * Writes only `status`/`reviewedAt`/`rejectionReason`/`updatedAt` — every
 * other field (sellerId, title, price, images, ...) is left completely
 * untouched.
 *
 * Local (emulator) usage:
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     npm run publish-artwork -- <artworkId> publish
 *     npm run publish-artwork -- <artworkId> reject "does not meet quality guidelines"
 *
 * Production usage (run only by the project owner, never committed):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json npm run publish-artwork -- <artworkId> publish
 */
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

export type PublishDecision = 'PUBLISHED' | 'REJECTED'

/**
 * Refuses to act unless the artwork exists and its current status is
 * exactly SUBMITTED — never re-publishes/re-rejects an already-decided
 * artwork, and never touches a DRAFT one (idempotency and invalid-transition
 * guards, not a silent no-op or a silent overwrite).
 *
 * The read-check-write runs inside a Firestore transaction so two truly
 * concurrent decisions on the same artwork (e.g. two admins, one approving
 * and one rejecting at nearly the same moment) can never both silently
 * apply: Firestore automatically retries the loser's transaction, which
 * re-reads the just-committed status and correctly throws the same
 * "not awaiting review" error a sequential second call would get, instead
 * of the artwork's final state depending on which write physically landed
 * last.
 */
export async function decideArtworkByArtworkId(
  artworkId: string,
  decision: PublishDecision,
  options: { rejectionReason?: string } = {},
): Promise<void> {
  const db = getFirestore()
  const artworkRef = db.collection('artworks').doc(artworkId)

  await db.runTransaction(async (transaction) => {
    const artworkSnapshot = await transaction.get(artworkRef)
    if (!artworkSnapshot.exists) {
      throw new Error(`No artwork found for artworkId=${artworkId}.`)
    }
    const currentStatus = artworkSnapshot.data()?.status
    if (currentStatus !== 'SUBMITTED') {
      throw new Error(
        `Artwork ${artworkId} is not awaiting review (current status: ${String(currentStatus)}). ` +
          'Only a SUBMITTED artwork can be published or rejected.',
      )
    }

    if (decision === 'REJECTED') {
      transaction.update(artworkRef, {
        status: 'REJECTED',
        reviewedAt: FieldValue.serverTimestamp(),
        rejectionReason: options.rejectionReason ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      })
    } else {
      transaction.update(artworkRef, {
        status: 'PUBLISHED',
        reviewedAt: FieldValue.serverTimestamp(),
        rejectionReason: null,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
  })

  if (decision === 'REJECTED') {
    console.log(`Rejected artworkId=${artworkId}.${options.rejectionReason ? ` Reason: ${options.rejectionReason}` : ''}`)
  } else {
    console.log(`Published artworkId=${artworkId}.`)
  }
}

async function main(): Promise<void> {
  const [, , artworkId, decisionArg, ...reasonParts] = process.argv
  const normalizedDecision = decisionArg?.toLowerCase()

  if (!artworkId || (normalizedDecision !== 'publish' && normalizedDecision !== 'reject')) {
    console.error('Usage: npm run publish-artwork -- <artworkId> <publish|reject> [rejection reason...]')
    process.exitCode = 1
    return
  }

  initializeApp()
  await decideArtworkByArtworkId(artworkId, normalizedDecision === 'publish' ? 'PUBLISHED' : 'REJECTED', {
    rejectionReason: normalizedDecision === 'reject' && reasonParts.length > 0 ? reasonParts.join(' ') : undefined,
  })
}

// Only runs when this file is executed directly (`node lib/publishArtwork.js`)
// — not when `decideArtworkByArtworkId` is imported elsewhere, e.g. by its
// own test file, which must not trigger a real CLI run as a side effect of
// import.
if (require.main === module) {
  void main()
}
