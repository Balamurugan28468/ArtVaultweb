# ArtVault — Database Architecture (Firestore)

**Status: foundation + authentication + customer account + seller/artwork
foundation + public artist profiles.** Module 00 created a deny-by-default
rules skeleton. Module 01 (Authentication) created `users/{uid}`, written
once by the `onUserCreate` Cloud Function right after sign-up (see
`functions/src/index.ts`). Module 03 (Customer Account & Profile Foundation)
extends that same document with the editable profile fields below and adds
the field-level update rule that protects them — see `docs/SECURITY.md`.
Module 04 (Seller Foundation & Artwork Draft Management) implements
`sellers/{uid}` and `artworks/{artworkId}` as described below. Module 06
(Artist Profiles) implements `artists/{artistId}` — ArtVault's first
genuinely public (unauthenticated-readable) collection. Every other
collection remains design-only — not created, read, or written by any code
yet — recorded here so later modules build toward one consistent shape
instead of improvising per-feature.

## `users/{uid}` (implemented in Module 01, extended in Module 03)

```
uid: string                                          read-only from client
email: string | null                                 read-only from client
displayName: string | null                           editable
photoURL: string | null                               read-only from client (no avatar upload yet)
role: 'CUSTOMER' | 'SELLER' | 'ADMIN' | 'SUPER_ADMIN' read-only from client
phoneNumber: string | null                            editable, optional
bio: string | null                                    editable, optional
profileCompleted: boolean                             editable (UX metadata only, never authorization)
createdAt: Timestamp (server)                          read-only from client
updatedAt: Timestamp (server)                          set by every client update via serverTimestamp()
```

Created only by `functions/src/index.ts`'s `onUserCreate` Auth trigger,
using the Admin SDK (which bypasses security rules entirely) — a client can
never create this document directly (`firestore.rules` denies `create`
outright). The trigger initializes every field above, including the
Module-03 additions, so every account created from this point on has the
full shape; a document created before Module 03 shipped may be missing
`photoURL`/`phoneNumber`/`bio`/`profileCompleted` — see "Backward
compatibility" below.

The owning user may `read` their own doc and `update` exactly the fields
marked "editable" above via `src/features/account/api/profileRepository.ts`
(`updateUserProfile`). `firestore.rules` enforces this itself, not just the
UI: `uid`, `email`, `role`, `createdAt`, and `photoURL` must stay unchanged
on any client-issued update, and the update's changed-key set is restricted
to exactly `displayName`, `phoneNumber`, `bio`, `profileCompleted`,
`updatedAt` — no request, however constructed (partial `updateDoc()` or a
full-document `setDoc()` overwrite), can add an unlisted field or change a
protected one. Role escalation from the client is structurally impossible,
not just discouraged. `ADMIN`/`SUPER_ADMIN` are only ever granted by the
`functions/src/setAdminClaim.ts` operator script, run locally by a human
with Admin SDK credentials — never by any deployed, client-reachable
function.

### Backward compatibility

No document created before this module's `onUserCreate` change is known to
exist in any persisted environment (this project has never been deployed —
see `docs/DEPLOYMENT.md`), so this is a theoretical, documented limitation
rather than a live migration need. If one ever did exist, the stricter
Module 03 update rule (which requires `displayName`/`phoneNumber`/`bio`/
`profileCompleted` to already be valid, present values on every update)
would reject updates to it until a one-time backfill sets the missing
fields — the rule fails closed (denies), never silently accepts a
partially-shaped document. `profileRepository.ts`'s read-side mapping is
separately defensive about this (`mapToProfile` treats any missing optional
field as `null`/`false` rather than crashing), so *reading* such a document
in the UI is safe even though *updating* it would need the backfill first.

## `sellers/{uid}` (implemented in Module 04)

```
uid: string                    == the document id == the applicant's auth uid; read-only from client
status: 'PENDING' | 'APPROVED' forced to 'PENDING' on client create; never client-updatable afterward
businessName: string           2-80 chars
description: string            10-500 chars
contactEmail: string           defaults to the applicant's account email in the UI, editable there
appliedAt: Timestamp (server)  set once, on submission
reviewedAt: Timestamp | null   set only by functions/src/promoteSeller.ts (Admin SDK)
createdAt: Timestamp (server)
updatedAt: Timestamp (server)
```

Deliberately keyed by `uid` (the same id as `users/{uid}`), not a separate
generated `sellerId` — one application per person, no indirection needed
until a real multi-storefront-per-seller concept is ever built. A client may
`create` their own application (`status` forced to `'PENDING'` by the rule
regardless of what's sent) and `read` it; **`update` and `delete` are both
`false` for every client**, including the applicant themselves — Firestore
evaluates a write as `create` only when no document currently exists at that
path, `update` otherwise, so a duplicate application attempt against an
already-PENDING (or already-APPROVED) document is rejected as an
unauthorized update automatically, without any separate "already applied"
check. The only path from `PENDING` to `APPROVED` is
`functions/src/promoteSeller.ts` — a local operator script (Admin SDK,
never a deployed/client-reachable function), which also grants the `SELLER`
custom claim and mirrors `role: 'SELLER'` onto `users/{uid}`. See
`docs/SECURITY.md` for the full rationale, including why a formal
Admin-reviewer UI was deliberately not built yet.

## `artworks/{artworkId}` (DRAFT/SUBMITTED from Module 04; PUBLISHED/REJECTED added in Module 07)

```
sellerId: string          == the owning seller's auth uid; immutable after create
title: string              2-100 chars
description: string        10-2000 chars
price: number               integer minor currency units (paise — price in ₹ × 100), never a float
category: string            one of a small fixed set (painting | sculpture | photography | digital | other)
tags: string[]              up to 10 tags, 30 chars each — a small bounded list, not an unbounded relationship
images: ArtworkImage[]      up to 6 (see below) — real Storage-backed uploads (Module 05)
inventoryCount: number      integer >= 0
status: 'DRAFT' | 'SUBMITTED' | 'PUBLISHED' | 'REJECTED'
reviewedAt: Timestamp | null      server timestamp set the moment a trusted reviewer decides; null until then
rejectionReason: string | null    operator-supplied free text, only ever set alongside REJECTED; null otherwise
createdAt: Timestamp (server)
updatedAt: Timestamp (server)
```

Four lifecycle states exist so far:

- **`DRAFT`** — seller-owned work in progress; private (visible only to the
  owning seller).
- **`SUBMITTED`** — submitted for trusted review; private (visible only to
  the owning seller — not to any reviewer via a UI, since none exists yet;
  the trusted operator script reads it directly via the Admin SDK, which
  bypasses `firestore.rules` entirely).
- **`PUBLISHED`** — approved for public visibility; publicly readable by
  anyone, signed in or not.
- **`REJECTED`** — review failed; private (visible only to the owning
  seller, same as `DRAFT`/`SUBMITTED`).

Permitted transitions: `DRAFT → SUBMITTED` (client-initiated, by the owning
seller); `SUBMITTED → PUBLISHED` and `SUBMITTED → REJECTED` (trusted-operator-
only, see below — never client-initiated). There is deliberately no
`PUBLISHED → *` or `REJECTED → *` transition yet (e.g. re-submitting a
rejected artwork, or unpublishing one) — those belong to whichever future
module actually needs them. `PENDING_REVIEW` was deliberately not
introduced as a separate state: `SUBMITTED` already means "awaiting trusted
review," so a distinct `PENDING_REVIEW` would only duplicate that meaning.
Every state past `PUBLISHED`/`REJECTED` in the eventual full lifecycle
(commerce states like `AVAILABLE`/`RESERVED`/`SOLD`, auction states, AI
processing, admin suspension/cancellation) remains deferred to the modules
that actually own their transitions — Module 07 deliberately does not
introduce any of them.

A `SELLER` may `create` their own artwork (`sellerId` must equal their own
uid, `status` forced to `'DRAFT'`, `images` forced empty — photos can only
be added once the artwork exists, see below). While `DRAFT`, the owner may
freely edit an explicit allow-list of ordinary fields (title, description,
price, category, tags, images, inventoryCount, updatedAt — enforced via a
`diff(...).affectedKeys().hasOnly([...])` check, so no other field, e.g.
`reviewedAt`, can be smuggled into an ordinary edit), or submit
(`DRAFT → SUBMITTED`, touching only `status`/`updatedAt` — no other field,
including `images`, may change in that same write) or delete. **Once
`SUBMITTED`, the document is locked from ordinary seller edits entirely** —
no field, including reverting back to `DRAFT`, can be changed by the
client. The owning seller may always `read` their own artwork regardless of
status; the public may additionally `read` it once (and only once) its
`status` is `PUBLISHED` — see "Artwork visibility" under `artists/{artistId}`
below. `ar: {...}` is deliberately not part of this document yet — added by
the AR module per `docs/AR_ARCHITECTURE.md` once it exists.

### Trusted publishing/rejection mechanism (Module 07)

`SUBMITTED → PUBLISHED` and `SUBMITTED → REJECTED` are performed exclusively
by `functions/src/publishArtwork.ts` — a local, Admin-SDK-only operator
script in the same family as `functions/src/promoteSeller.ts`. It is never
deployed and never reachable by any client or callable endpoint; it is run
directly by the project owner (`npm run publish-artwork -- <artworkId>
publish|reject [reason]`). Before writing anything it re-fetches the
artwork and throws unless its current `status` is exactly `'SUBMITTED'` —
it never re-publishes/re-rejects an already-decided artwork and never
touches a `DRAFT` one. Its update touches only `status`, `reviewedAt`,
`rejectionReason`, and `updatedAt` (via server timestamps for the first and
last) — every other field, including `sellerId`, `title`, `price`, and
`images`, is left completely untouched. This mirrors exactly how seller
approval already works: no self-service or in-app path exists, and no
temporary client-side reviewer/admin UI was built to support it.

### `images` — artwork photos (Module 05)

```
id: string            filename incl. extension, e.g. "3f9c...-a1b2.jpg"
path: string           "artworks/{sellerId}/{artworkId}/{id}" — the real Cloud Storage object
url: string             a download URL resolved once at upload time
order: number          display position; a sort key only, never assumed unique/contiguous
contentType: string    one of image/jpeg | image/png | image/webp
size: number           bytes; ≤ 10 MB
```

Up to 6 per artwork. `path` is pinned by `firestore.rules` to exactly the
owner-scoped location a real upload for *this* artwork could ever produce
(`artworks/{sellerId}/{artworkId}/{id}`, matching the auth uid on the
document and the path segment of the document itself) — a client can never
point an artwork at another seller's photo, another artwork's photo, or an
arbitrary external URL by writing Firestore metadata alone, the same
"never trust Firestore alone" principle Module 04 applies to authorization.
The real bytes live only in Cloud Storage; `storage.rules` independently
re-enforces the owner/role/lifecycle/content-type/size constraints on the
actual object, since Firestore metadata and the Storage object are written
through two independent services with no shared transaction between them.
See `docs/SECURITY.md` for the full rule text and rationale.

`price` is stored as an integer number of minor currency units (paise) so
it can never accumulate floating-point rounding error; the seller-facing UI
(`src/features/artwork/components/ArtworkForm.tsx`) is the only place that
ever converts to/from a whole-rupee display value, and only whole-rupee
amounts are accepted from a seller in Module 04 (no paise-level/decimal
pricing input yet — a documented, deliberate simplification).

A narrow public read path exists for `artworks/{artworkId}` as of Module 07:
an artwork whose `status` is `PUBLISHED` is readable by anyone. `DRAFT`,
`SUBMITTED`, and `REJECTED` remain visible only to their own seller. Public
*browsing/search* across all published artworks (a Marketplace) is not part
of this — that's a future module's job; the only public read path built so
far is the per-seller query the public artist page uses (see below).

## `artists/{artistId}` (implemented in Module 06 — public projection)

```
uid: string                    == the document id; the approved seller's own auth uid — never a separately generated id
displayName: string            public display name; 2-80 chars; seeded from sellers/{uid}.businessName, then independently seller-editable
bio: string                    public bio; 10-500 chars; seeded from sellers/{uid}.description, then independently seller-editable
createdAt: Timestamp (server)  set once, when the profile is first created
updatedAt: Timestamp (server)  set on every update
```

**ArtVault's first genuinely public (unauthenticated-readable) collection.**
`artistId` is deliberately the same value as the underlying approved
seller's own auth uid (matching the `sellers/{uid}` precedent: keyed by
uid, no indirection until a real multi-storefront-per-seller concept
exists), but `artists/{artistId}` is a **physically separate document**
from `sellers/{uid}` — not the same document opened to public reads, and
not a rules-level projection of it. This is deliberate: `contactEmail`,
`status`, `appliedAt`, `reviewedAt`, and every other field on the private
`sellers/{uid}` application record simply do not exist anywhere in this
document, so a public visitor can never reach one by reading it, no matter
how the rules evolve later. `sellers/{uid}` remains the sole authoritative
*private* seller/application record; `artists/{uid}` is a narrow, curated
*public* one, and the two are kept in sync one-way (private → public,
never the reverse) by the mechanism below — never by opening the private
document itself.

### Profile creation and synchronization

An `artists/{uid}` document is **never created by a client** —
`firestore.rules` denies `create` unconditionally, the same structural
guarantee `sellers/{uid}` already has for `update`/`delete`. It is created
by exactly two trusted, Admin-SDK-only, never-client-reachable operator
scripts, both seeding `displayName`/`bio` from that seller's own
already-validated `sellers/{uid}` record at the moment of creation:

- **`functions/src/promoteSeller.ts`** — creates it at the exact moment
  (and only the moment) a seller application is approved, immediately
  after granting the `SELLER` custom claim. This is the normal, forward-
  going path for every seller approved from this point on.
- **`functions/src/reconcileRoles.ts`** — backfills a missing `artists/{uid}`
  for any seller already APPROVED before this module existed (a real,
  needed case — see "Real owner verification" in
  `ARTVAULT_PROJECT_STATE.md`), or in the rare case `promoteSeller.ts`'s own
  write sequence failed partway. Idempotent and non-destructive: it only
  ever creates a profile that's missing, and never overwrites one that
  already exists — a seller's own later edits to their public
  `displayName`/`bio` are never at risk of being clobbered by a later
  reconciliation run.

After creation, the owning approved seller may edit `displayName`/`bio`
themselves directly (client-writable, via a tightly-scoped `firestore.rules`
allow-list — see `docs/SECURITY.md`), the same self-service pattern
Module 03 established for `users/{uid}`'s editable fields. `uid` and
`createdAt` are immutable from the client forever.

### Artwork visibility on the public artist page (Module 07)

The public artist page (`/artists/{artistId}`,
`src/features/artist-profile/components/PublicArtistArtworks.tsx`) queries
`artworks` for `sellerId == artistId && status == 'PUBLISHED'`
(`subscribePublishedArtworks` in
`src/features/artwork/api/artworkRepository.ts`) and renders the results
with `PublicArtworkCard`/`PublicArtworkGrid` — components deliberately kept
separate from the owner-facing `ArtworkListItem`/`ArtworkList` so no
owner-only control (edit, delete, a status badge) can ever leak onto a
public page. `DRAFT`, `SUBMITTED`, and `REJECTED` artworks are structurally
excluded by the query itself, not filtered client-side after the fact, and
the page still shows the same honest "no public artworks yet" empty state
from Module 06 when a seller has zero `PUBLISHED` artworks. Two equality
filters on different fields (`sellerId`, `status`) do not require a
Firestore composite index. Public *browsing/search* across all sellers'
published artworks (a Marketplace) remains a future module's job — this
query is scoped to one seller at a time, matching the page it serves.

## Guiding rule: no unbounded arrays

Any relationship that can grow open-endedly (cart contents, order line
items, likes, follows) is modeled as its own subcollection with one document
per item, never as an array field on a parent document. Membership checks
become single document reads instead of array scans, and counts are
maintained as denormalized counter fields updated transactionally — never
computed by reading an entire subcollection.

## Draft collection layout

(`users/{uid}`, `sellers/{uid}`, `artworks/{artworkId}`, and
`artists/{artistId}` are now implemented as described above; everything
below remains design-only. Note `artworks/{artworkId}` will gain an
`ar: {...}` sub-object — see that section above — and further status
values, once the AR and review/Marketplace modules that would actually use
them exist. The `follows/{artistId}/followers/{followerUid}` entry below
refers to that same now-implemented `artists/{artistId}` id — follower
counts and the follow relationship itself remain entirely unbuilt; Module 06
deliberately does not implement them.)

```
carts/{uid}/items/{artworkId}
  quantity, unitPriceSnapshot, addedAt

orders/{orderId}
  buyerId, sellerIds[], status, totals, cancellation: { reason, note, at }
orders/{orderId}/items/{itemId}
  artworkId, titleSnapshot, unitPriceSnapshot, quantity
  -- an immutable snapshot taken at purchase time; never re-reads the live
     artwork price after the fact.

wishlists/{uid}/items/{artworkId}
  addedAt

likes/{artworkId}/by/{uid}
  likedAt
  -- like COUNT is a denormalized counter field on the artwork doc,
     maintained by a Cloud Function transaction on write/delete.

follows/{followerUid}/following/{artistId}      "who I follow"
follows/{artistId}/followers/{followerUid}      mirrored: "who follows this artist"
  -- follower COUNT denormalized on the artist doc, same pattern as likes.

reviews/{artworkId}/entries/{reviewId}
  authorId, rating, text, createdAt

notifications/{uid}/items/{id}
  type, payload, readAt

auctions/{auctionId}
  artworkId, startAt (explicit trusted Timestamp), endAt (explicit trusted
  Timestamp), status, currentHighBid (denormalized), createdAt, updatedAt
auctions/{auctionId}/bids/{bidId}
  amount, placedAt (server timestamp), bidderUid
  -- append-only, full history. Public bid-feed reads are served a
     restricted view (amount + timestamp + display alias only) via rules
     or a mirrored public-safe projection — never the bidder's uid/contact
     fields directly. Full bidder identity is readable only by the bidder
     themselves, the seller of a closed auction, and admins.

auditLogs/{id}
  immutable, append-only, written exclusively by Cloud Functions
```

Exact composite indexes, and the precise public-vs-private bid document
split, are finalized when the marketplace/search and auctions modules are
actually built, and recorded live in `ARTVAULT_PROJECT_STATE.md` at that
point.

See `docs/AUCTION_ARCHITECTURE.md` for why `startAt`/`endAt` are explicit
trusted timestamps rather than `serverTimestamp()`.
