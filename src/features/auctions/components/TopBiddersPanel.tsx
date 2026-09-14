import { Trophy } from 'lucide-react'
import { Card } from '@/shared/ui'

/**
 * The completed-auction result page's "Top Bidders" panel — honestly not
 * connected, exactly like BidHistoryPanel and for the same reason (the
 * `bids` subcollection is fully closed in firestore.rules; the public/
 * private bid-privacy split is explicitly undecided per docs/DATABASE.md
 * and AUCTION_ARCHITECTURE.md). Deliberately never renders a ranked
 * bidder list of any kind — not even placeholder rows — since there is no
 * real bid data behind it today.
 */
export function TopBiddersPanel() {
  return (
    <Card className="flex flex-col items-center gap-2 p-6 text-center">
      <Trophy aria-hidden="true" className="h-6 w-6 text-text-muted" />
      <p className="text-sm font-medium text-text-primary">Bid ranking unavailable</p>
      <p className="max-w-xs text-xs text-text-secondary">
        Once bidding is connected, the top bidders for this auction will be ranked here.
      </p>
    </Card>
  )
}
