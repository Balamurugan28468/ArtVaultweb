import { History } from 'lucide-react'
import { Card } from '@/shared/ui'
import type { AuctionStatus } from '../types'

/**
 * Honestly not connected — docs/DATABASE.md and AUCTION_ARCHITECTURE.md
 * both explicitly leave the public-vs-private split of the `bids`
 * subcollection undecided ("finalized when the auctions module is
 * actually built"), so firestore.rules keeps it fully closed
 * (`allow read, write: if false`) for now rather than guessing at a
 * privacy-sensitive rule this UI-only pass has no authority to invent. No
 * bid ever exists to show yet regardless (see CurrentBidPanel), so this
 * stays an honest placeholder rather than issuing a read that would only
 * ever be denied. The heading follows the auction's real status — "Live
 * Bidding" while it's actually LIVE (matching the reference), "Bid
 * History" otherwise — cosmetic only, the honest not-connected body copy
 * never changes.
 */
export function BidHistoryPanel({ status }: { status?: AuctionStatus }) {
  const heading = status === 'LIVE' ? 'Live Bidding' : 'Bid History'
  return (
    <Card className="flex flex-col items-center gap-2 p-6 text-center">
      <History aria-hidden="true" className="h-6 w-6 text-text-muted" />
      <p className="text-sm font-medium text-text-primary">{heading} isn't connected yet</p>
      <p className="max-w-xs text-xs text-text-secondary">
        Once bidding goes live, every bid placed on this auction will appear here in real time.
      </p>
    </Card>
  )
}
