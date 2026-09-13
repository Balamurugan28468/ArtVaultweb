/**
 * Module 13 Phase 1 — the project's first callable Cloud Functions. Unlike
 * every other file in this directory (promoteSeller.ts, publishArtwork.ts,
 * etc. — local, Admin-SDK-only operator scripts a human runs by hand), these
 * ARE deployed and ARE reachable, by design: they're the server-side
 * foundation the future /admin UI calls via the client SDK's
 * `httpsCallable()`. That makes the authorization check below the single
 * most security-critical code in this file — see `requireAdminCaller`.
 *
 * Deliberately thin wrappers: all of the actual trusted business logic
 * (who may become a SELLER, who may publish/reject an artwork, which fields
 * may change) stays exactly where it already lived and was already tested —
 * `promoteSellerByUid`/`rejectSellerApplicationByUid` (promoteSeller.ts) and
 * `decideArtworkByArtworkId` (publishArtwork.ts). Nothing here re-implements
 * or duplicates that logic; it only adds the auth/validation boundary a real
 * HTTP-reachable endpoint needs that a human-run local script never did.
 */
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'
import { decideArtworkByArtworkId, type PublishDecision } from './publishArtwork'
import { promoteSellerByUid, rejectSellerApplicationByUid } from './promoteSeller'

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN'])

/**
 * The one and only authorization gate for every admin callable in this
 * file — reviewed once, reused everywhere, rather than re-implemented
 * per-function where a copy/paste mistake could silently weaken one path.
 * Reads the role from `request.auth.token`, the SDK-verified decoded ID
 * token claims (the exact same claim `firestore.rules`' own `hasRole()`
 * reads) — never from `request.data`, which is fully client-controlled and
 * must never be trusted for an authorization decision. Every property read
 * here is optionally-chained: the Callable Functions SDK's own contract
 * guarantees `request.auth.token` is always present once `request.auth`
 * itself is set, but this check is the project's actual security boundary,
 * so it fails closed (denies) rather than throwing an unhandled exception
 * if that contract were ever somehow violated, instead of trusting it blindly.
 */
function requireAdminCaller(request: CallableRequest<unknown>): void {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign-in required.')
  }
  const role = request.auth.token?.role
  if (typeof role !== 'string' || !ADMIN_ROLES.has(role)) {
    throw new HttpsError('permission-denied', 'This action requires an administrator account.')
  }
}

/** Defensive input validation at the server boundary — never assumes the caller's payload has any particular shape. */
function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpsError('invalid-argument', `A valid "${field}" is required.`)
  }
  return value
}

// Real Firestore document ids are short, opaque, auto-generated strings (a
// Firestore auto-id is 20 characters) — this is deliberately generous, not
// a guess at the real length, while still rejecting anything implausible.
const DOCUMENT_ID_MAX_LENGTH = 200

/**
 * Whether `value` contains a forward slash or any ASCII control character.
 * A slash would make `.doc(id)` address a *different*, deeper document
 * under the same collection instead of the single flat document this code
 * always means (see the Phase 2 security report's "Input validation
 * findings" for the concrete scenario) — rejected outright, never silently
 * normalized. Control characters have no legitimate reason to appear in an
 * id either. Written as an explicit character-code scan, deliberately not a
 * regex literal with escape sequences, to keep this check unambiguous and
 * easy to verify by inspection.
 */
function containsForbiddenIdCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    const isControlCharacter = code < 0x20 || code === 0x7f
    const isForwardSlash = value[i] === '/'
    if (isControlCharacter || isForwardSlash) return true
  }
  return false
}

/** Stricter than `requireNonEmptyString` — for a value that is used as a Firestore document id, never as free text. */
function requireDocumentId(value: unknown, field: string): string {
  const id = requireNonEmptyString(value, field)
  if (id.length > DOCUMENT_ID_MAX_LENGTH || containsForbiddenIdCharacters(id)) {
    throw new HttpsError('invalid-argument', `"${field}" is not a valid document id.`)
  }
  return id
}

// A rejection reason is a short admin note, not a document — matches the
// existing seller-application `description` field's own 500-character bound
// (`firestore.rules`' `isValidSellerApplication`), reused here rather than
// inventing a new, unrelated limit.
const REJECTION_REASON_MAX_LENGTH = 500

/** Whether `value` contains any ASCII control character (including newlines) — see `containsForbiddenIdCharacters` for why this is a character-code scan, not a regex literal. */
function containsControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/** For admin-authored free text (a rejection reason) — bounded length, no control characters, still just a plain trimmed string otherwise. */
function requireBoundedText(value: unknown, field: string, maxLength: number): string {
  const text = requireNonEmptyString(value, field)
  if (text.length > maxLength || containsControlCharacters(text)) {
    throw new HttpsError('invalid-argument', `"${field}" must be ${maxLength} characters or fewer and contain no control characters.`)
  }
  return text
}

// The exact, closed set of messages `promoteSellerByUid`/
// `rejectSellerApplicationByUid`/`decideArtworkByArtworkId` are known to
// throw (each asserted on by those files' own existing tests). Only these
// are ever echoed back to a caller — see `toCallableError` below for why an
// *unrecognized* Error is not treated the same way.
const KNOWN_DOMAIN_ERROR_PATTERNS: RegExp[] = [
  /^no seller application found for uid=/i,
  /^seller application for uid=.+ is already approved\.$/i,
  /^seller application for uid=.+ is already rejected\.$/i,
  /^no artwork found for artworkId=/i,
  /^artwork .+ is not awaiting review /i,
]

/**
 * Maps a known domain-invariant violation — thrown by the trusted business
 * logic itself, e.g. "no seller application found" / "already approved" /
 * "not awaiting review" — to the appropriate callable error code, without
 * ever inventing a different message than the one the trusted function
 * already produces (and that its own existing tests already assert on).
 *
 * Anything that is NOT one of those specific, known messages — including a
 * raw Firestore/Admin-SDK error, a network failure, or any other genuinely
 * unexpected exception — is deliberately NOT echoed to the caller: its
 * message could contain internal detail (gRPC status text, project
 * internals, etc.) that has no business reaching a remote client, privileged
 * caller or not. It is logged server-side for real diagnosis and replaced
 * with one generic, safe message.
 */
function toCallableError(error: unknown): HttpsError {
  const message = error instanceof Error ? error.message : String(error)
  const isKnownDomainError = KNOWN_DOMAIN_ERROR_PATTERNS.some((pattern) => pattern.test(message))

  if (!isKnownDomainError) {
    console.error('adminActions: unexpected error while executing a trusted operation', error)
    return new HttpsError('internal', 'This action could not be completed. Please try again.')
  }

  const isNotFound = /^no (seller application|artwork) found/i.test(message)
  return new HttpsError(isNotFound ? 'not-found' : 'failed-precondition', message)
}

export interface ApproveSellerApplicationResult {
  status: 'APPROVED'
}

/**
 * The plain handler, exported separately from the deployed `onCall(...)`
 * wrapper below so it can be unit-tested directly with a hand-built
 * `CallableRequest`-shaped object — exactly how `index.test.ts` already
 * tests `handleUserCreate` directly rather than the wrapped trigger.
 */
export async function handleApproveSellerApplication(
  request: CallableRequest<unknown>,
): Promise<ApproveSellerApplicationResult> {
  requireAdminCaller(request)
  const data = (request.data ?? {}) as Record<string, unknown>
  const uid = requireDocumentId(data.uid, 'uid')

  try {
    await promoteSellerByUid(uid)
  } catch (error) {
    throw toCallableError(error)
  }

  return { status: 'APPROVED' }
}

export interface RejectSellerApplicationResult {
  status: 'REJECTED'
}

/**
 * The rejection counterpart to `handleApproveSellerApplication` — see
 * `promoteSeller.ts`'s `rejectSellerApplicationByUid` for the full business
 * logic and the schema-decision rationale (Option A, owner-approved in the
 * Phase 1 report review). A rejection reason is always required — this is
 * a moderation decision an applicant will see, not an optional note.
 */
export async function handleRejectSellerApplication(
  request: CallableRequest<unknown>,
): Promise<RejectSellerApplicationResult> {
  requireAdminCaller(request)
  const data = (request.data ?? {}) as Record<string, unknown>
  const uid = requireDocumentId(data.uid, 'uid')
  const rejectionReason = requireBoundedText(data.rejectionReason, 'rejectionReason', REJECTION_REASON_MAX_LENGTH)

  try {
    await rejectSellerApplicationByUid(uid, rejectionReason)
  } catch (error) {
    throw toCallableError(error)
  }

  return { status: 'REJECTED' }
}

export interface ModerateArtworkResult {
  status: PublishDecision
}

/**
 * One callable for both artwork-moderation outcomes, deliberately mirroring
 * `decideArtworkByArtworkId`'s own existing unified `(id, decision, options)`
 * signature exactly, rather than inventing two separate callables (and two
 * separate copies of the same validation) for what the trusted logic itself
 * already treats as one operation with two outcomes.
 */
export async function handleModerateArtwork(request: CallableRequest<unknown>): Promise<ModerateArtworkResult> {
  requireAdminCaller(request)
  const data = (request.data ?? {}) as Record<string, unknown>
  const artworkId = requireDocumentId(data.artworkId, 'artworkId')
  const decision = data.decision

  if (decision !== 'PUBLISHED' && decision !== 'REJECTED') {
    throw new HttpsError('invalid-argument', 'decision must be exactly "PUBLISHED" or "REJECTED".')
  }

  const rejectionReason =
    decision === 'REJECTED' ? requireBoundedText(data.rejectionReason, 'rejectionReason', REJECTION_REASON_MAX_LENGTH) : undefined

  try {
    await decideArtworkByArtworkId(artworkId, decision, { rejectionReason })
  } catch (error) {
    throw toCallableError(error)
  }

  return { status: decision }
}

/**
 * App Check — reviewed for Module 13 Phase 2, deliberately not enabled yet.
 *
 * `onCall()` is called here with no `enforceAppCheck` option, and nothing in
 * any of the three handlers above reads or depends on `request.app` (the
 * field the SDK populates from a verified App Check token) — the only
 * authorization input is `request.auth.token.role`, entirely independent of
 * App Check. That means turning on `enforceAppCheck: true` later is a
 * pure additive change (the SDK would reject a request before it ever
 * reaches these handlers if the token is missing/invalid) — nothing here
 * needs to be restructured first, and nothing here would silently start
 * depending on App Check being present.
 *
 * It is intentionally NOT enabled now because this project is developed and
 * tested exclusively against the local Firebase Emulator Suite, and
 * production Firebase App Check registration/attestation (reCAPTCHA
 * Enterprise for web, Play Integrity/App Attest for native) has not been
 * configured — enabling enforcement without that in place would either
 * require disabling it again for local development or block every local
 * emulator call outright.
 *
 * REQUIRED before any production deployment of these callables:
 * `enforceAppCheck: true` on all three `onCall()` calls below, once a real
 * App Check provider is registered for this Firebase project. Recorded here
 * and in docs/SECURITY.md / ARTVAULT_PROJECT_STATE.md as a real, tracked
 * pre-launch requirement — not a silently-forgotten TODO. Deferring App
 * Check changes nothing about the authentication/authorization boundary
 * above: `requireAdminCaller` remains mandatory and unweakened regardless.
 */

/**
 * Rate limiting / abuse protection — analyzed for Module 13 Phase 2,
 * deliberately not implemented in-process.
 *
 * Abuse surface for these three callables: (1) a non-admin caller
 * hammering the endpoint — cheaply mitigated today, since
 * `requireAdminCaller` rejects before any Firestore read or write, so an
 * unauthorized caller cannot drive Firestore cost/load no matter how many
 * requests they send, and Cloud Functions/Cloud Run's own platform-level
 * infrastructure (independent of this codebase) absorbs raw request-flood
 * traffic; (2) a genuine ADMIN/SUPER_ADMIN account, compromised or
 * malicious, calling one of these repeatedly — the transactional
 * idempotency guards proven above (repeated-invocation and
 * near-simultaneous-caller tests) mean extra calls beyond the first are
 * inert no-ops/errors, never compounding or duplicating a privileged
 * effect, which is the specific kind of "abuse" a rate limiter would
 * otherwise exist to bound the damage of.
 *
 * A per-instance in-memory counter/limiter was deliberately NOT added: each
 * Cloud Functions instance has its own isolated memory, so an in-memory
 * limiter only bounds requests landing on one instance and provides no real
 * limit at all under normal auto-scaling — presenting that as "rate
 * limiting" would be exactly the kind of fake/unreliable security control
 * this project does not ship.
 *
 * REQUIRED before any production deployment, if this endpoint's real-world
 * abuse profile is judged to need it: genuine distributed rate limiting
 * (e.g. a shared Firestore/Redis-backed counter, or a platform-level
 * control such as Cloud Armor / App Check's own reCAPTCHA Enterprise
 * scoring) — a deliberate future decision, not something silently assumed
 * unnecessary.
 */
export const approveSellerApplication = onCall(handleApproveSellerApplication)
export const rejectSellerApplication = onCall(handleRejectSellerApplication)
export const moderateArtwork = onCall(handleModerateArtwork)
