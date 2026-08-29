# ArtVault — Database Architecture (Firestore)

**Status: design draft only.** Module 00 creates a deny-by-default rules
skeleton (`firestore.rules`) and an empty `firestore.indexes.json`. No
collection below is created, read from, or written to by any code yet —
they are recorded here so later modules build toward one consistent shape
instead of improvising per-feature.

## Guiding rule: no unbounded arrays

Any relationship that can grow open-endedly (cart contents, order line
items, likes, follows) is modeled as its own subcollection with one document
per item, never as an array field on a parent document. Membership checks
become single document reads instead of array scans, and counts are
maintained as denormalized counter fields updated transactionally — never
computed by reading an entire subcollection.

## Draft collection layout

```
users/{uid}
  profile, role (mirror of the auth custom claim, not authoritative),
  sellerRef, createdAt, updatedAt

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
