import { Badge, type BadgeTone } from '@/shared/ui'
import type { AuctionStatus } from '../types'

const STATUS_LABEL: Record<AuctionStatus, string> = {
  SCHEDULED: 'Upcoming',
  LIVE: 'Live',
  ENDED: 'Ended',
}

const STATUS_TONE: Record<AuctionStatus, BadgeTone> = {
  SCHEDULED: 'gold',
  // Visual-matching pass: a strong red "LIVE" pill (the reference's own
  // urgent-red treatment) reads as more attention-grabbing than green for
  // "bidding is happening right now" — purely a tone change, the derived
  // status/logic behind it is unchanged.
  LIVE: 'danger',
  ENDED: 'neutral',
}

export function AuctionStatusBadge({ status }: { status: AuctionStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
}
