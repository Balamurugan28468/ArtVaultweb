# ArtVault — Database Architecture (Firestore)

**Status: foundation + authentication + customer account.** Module 00
created a deny-by-default rules skeleton. Module 01 (Authentication) created
`users/{uid}`, written once by the `onUserCreate` Cloud Function right after
sign-up (see `functions/src/index.ts`). Module 03 (Customer Account &
Profile Foundation) extends that same document with the editable profile
fields below and adds the field-level update rule that protects them — see
`docs/SECURITY.md`. Every other collection below remains design-only — not
created, read, or written by any code yet — recorded here so later modules
build toward one consistent shape instead of improvising per-feature.

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

## Guiding rule: no unbounded arrays

Any relationship that can grow open-endedly (cart contents, order line
items, likes, follows) is modeled as its own subcollection with one document
per item, never as an array field on a parent document. Membership checks
become single document reads instead of array scans, and counts are
maintained as denormalized counter fields updated transactionally — never
computed by reading an entire subcollection.

## Draft collection layout

(`users/{uid}` is now implemented as described above; everything below
remains design-only.)

```
sellers/{sellerId}
  storefront profile, status: pending | approved | suspended

artists/{artistId}
  public artist profile (may coincide with a sellerId)

artworks/{artworkId}
  title, price, images[], category, tags[], sellerId, inventoryCount, status
  ar: { widthCm, heightCm, depthCm?, placement: 'wall' | 'floor',
        modelGlbUrl?, modelUsdzUrl?, posterUrl? }
  -- an artwork is only AR-eligible once widthCm/heightCm are present;
     missing dimensions means no AR offer, never a guessed default.

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
