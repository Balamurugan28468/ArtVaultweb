# ArtVault — Database Architecture (Firestore)

**Status: foundation + authentication + customer account + seller/artwork
foundation.** Module 00 created a deny-by-default rules skeleton. Module 01
(Authentication) created `users/{uid}`, written once by the `onUserCreate`
Cloud Function right after sign-up (see `functions/src/index.ts`). Module 03
(Customer Account & Profile Foundation) extends that same document with the
editable profile fields below and adds the field-level update rule that
protects them — see `docs/SECURITY.md`. Module 04 (Seller Foundation &
Artwork Draft Management) implements `sellers/{uid}` and
`artworks/{artworkId}` as described below. Every other collection remains
design-only — not created, read, or written by any code yet — recorded here
so later modules build toward one consistent shape instead of improvising
per-feature.

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

## `artworks/{artworkId}` (implemented in Module 04 — DRAFT/SUBMITTED only)

```
sellerId: string          == the owning seller's auth uid; immutable after create
title: string              2-100 chars
description: string        10-2000 chars
price: number               integer minor currency units (paise — price in ₹ × 100), never a float
category: string            one of a small fixed set (painting | sculpture | photography | digital | other)
tags: string[]              up to 10 tags, 30 chars each — a small bounded list, not an unbounded relationship
images: ArtworkImage[]      up to 6 (see below) — real Storage-backed uploads (Module 05)
inventoryCount: number      integer >= 0
status: 'DRAFT' | 'SUBMITTED'
createdAt: Timestamp (server)
updatedAt: Timestamp (server)
```

Only the first two states of the eventual lifecycle
(`DRAFT → SUBMITTED → PENDING_REVIEW → APPROVED → PUBLISHED → ...`) exist
yet — every later state needs a reviewer or a Marketplace that doesn't exist
yet, and Module 04 deliberately doesn't build a status nothing can ever act
on or leave. A `SELLER` may `create` their own artwork (`sellerId` must
equal their own uid, `status` forced to `'DRAFT'`, `images` forced empty —
photos can only be added once the artwork exists, see below). While
`DRAFT`, the owner may freely edit ordinary fields (including `images`), or
submit (`DRAFT → SUBMITTED`, touching only `status`/`updatedAt` — no other
field, including `images`, may change in that same write) or delete. **Once
`SUBMITTED`, the document is locked from ordinary seller edits entirely** —
no field, including reverting back to `DRAFT`, can be changed by the
client; only the owning seller may even `read` it (no public Marketplace
read path exists yet — see below). `ar: {...}` is deliberately not part of
this document yet — added by the AR module per `docs/AR_ARCHITECTURE.md`
once it exists.

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

No public read path exists for `artworks/{artworkId}` yet — that's the
Marketplace module's job, once one is actually built to consume it; until
then, an artwork (`DRAFT` or `SUBMITTED`) is visible only to its own seller.

## Guiding rule: no unbounded arrays

Any relationship that can grow open-endedly (cart contents, order line
items, likes, follows) is modeled as its own subcollection with one document
per item, never as an array field on a parent document. Membership checks
become single document reads instead of array scans, and counts are
maintained as denormalized counter fields updated transactionally — never
computed by reading an entire subcollection.

## Draft collection layout

(`users/{uid}`, `sellers/{uid}`, and `artworks/{artworkId}` are now
implemented as described above; everything below remains design-only. Note
`artworks/{artworkId}` will gain an `ar: {...}` sub-object — see that
section above — and further status values, once the AR and
review/Marketplace modules that would actually use them exist.)

```
artists/{artistId}
  public artist profile (may coincide with a sellerId)

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
