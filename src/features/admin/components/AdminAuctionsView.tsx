import { useEffect, useState } from 'react'
import { AlertCircle, CalendarPlus, CheckCircle, Gavel, Loader2, Play, XCircle } from 'lucide-react'
import {
  activateAuction,
  cancelAuction,
  fetchAdminAuctions,
  scheduleAuctionLot,
  type AdminAuctionRow,
  type AuctionLotStatus,
} from '@/features/auctions'
import { getAllArtworks } from '@/features/admin/api/adminQueueRepository'
import type { Artwork } from '@/features/artwork'
import { Badge, type BadgeTone, Button, Card, Modal } from '@/shared/ui'
import { WeeklySelectionReview } from '@/features/auction-selection/components/WeeklySelectionReview'

function formatAmount(amount: number): string {
  return `₹${(amount / 100).toFixed(0)}`
}

function formatDate(timestamp: { toDate?: () => Date } | null): string {
  const date = timestamp?.toDate?.()
  if (!date) return '—'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const LOT_STATUS_TONE: Record<AuctionLotStatus, BadgeTone> = {
  OPEN: 'gold',
  WINNER_PENDING: 'warning',
  SETTLED: 'success',
  NO_BIDS: 'neutral',
  PAYMENT_EXPIRED: 'danger',
}

export function AdminAuctionsView() {
  const [selectionOpen,setSelectionOpen]=useState(false)
  const [auctions, setAuctions] = useState<AdminAuctionRow[]>([])
  const [artworks, setArtworks] = useState<Artwork[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Scheduling modal state
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [selectedArtworkId, setSelectedArtworkId] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [startingBidRupees, setStartingBidRupees] = useState('1000')
  const [bidIncrementRupees, setBidIncrementRupees] = useState('100')
  const [paymentWindowHours, setPaymentWindowHours] = useState('24')
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  // Action states
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  const activeLotArtworkIds = new Set(
    auctions
      .filter((a) => (a.auctionStatus === 'SCHEDULED' || a.auctionStatus === 'LIVE') && a.lotStatus !== 'NO_BIDS' && a.lotStatus !== 'SETTLED' && a.lotStatus !== 'PAYMENT_EXPIRED')
      .map((a) => a.artworkId)
  )

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [auctionList, artworkList] = await Promise.all([
        fetchAdminAuctions(),
        getAllArtworks(),
      ])
      setAuctions(auctionList)
      setArtworks(artworkList.filter((a) => a.status === 'PUBLISHED'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load auctions')
    } finally {
      setLoading(false)
    }
  }

  const handleArtworkChange = (artworkId: string) => {
    setSelectedArtworkId(artworkId)
    const art = artworks.find((a) => a.id === artworkId)
    if (art) {
      const pricePaise = art.price ?? (art as any).price_minor ?? 0
      const priceRupees = Math.round(pricePaise / 100)
      if (priceRupees > 0) {
        setStartingBidRupees(String(priceRupees))
        setBidIncrementRupees(String(Math.max(100, Math.round(priceRupees * 0.05))))
      }
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const handleActivate = async (auctionId: string) => {
    setActionLoadingId(auctionId)
    setError(null)
    setActionSuccess(null)
    try {
      await activateAuction(auctionId)
      setActionSuccess('Auction activated to LIVE successfully.')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate auction')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleCancel = async (auctionId: string) => {
    setActionLoadingId(auctionId)
    setError(null)
    setActionSuccess(null)
    try {
      await cancelAuction(auctionId, 'Admin cancelled before bidding')
      setActionSuccess('Auction cancelled successfully.')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel auction')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setScheduleError(null)

    if (!selectedArtworkId) {
      setScheduleError('Please select a published artwork.')
      return
    }
    if (!startsAt || !endsAt) {
      setScheduleError('Please specify start and end dates.')
      return
    }

    const startMs = new Date(startsAt).getTime()
    const endMs = new Date(endsAt).getTime()
    if (endMs <= startMs) {
      setScheduleError('End date must be after start date.')
      return
    }

    const startBid = Math.round(Number(startingBidRupees) * 100)
    const bidInc = Math.round(Number(bidIncrementRupees) * 100)
    const hours = Math.round(Number(paymentWindowHours))

    if (isNaN(startBid) || startBid <= 0) {
      setScheduleError('Starting bid must be a positive number.')
      return
    }
    if (isNaN(bidInc) || bidInc <= 0) {
      setScheduleError('Bid increment must be a positive number.')
      return
    }

    setScheduleLoading(true)
    try {
      await scheduleAuctionLot({
        artworkId: selectedArtworkId,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        startingBidMinor: startBid,
        bidIncrementMinor: bidInc,
        paymentWindowHours: hours,
      })
      setScheduleModalOpen(false)
      setActionSuccess('Auction lot scheduled successfully!')
      // Reset form
      setSelectedArtworkId('')
      setStartsAt('')
      setEndsAt('')
      await loadData()
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Failed to schedule auction')
    } finally {
      setScheduleLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Button type="button" variant="secondary" onClick={()=>setSelectionOpen(value=>!value)} aria-expanded={selectionOpen}>
        {selectionOpen?'Close weekly selection review':'Review intelligent weekly selection'}
      </Button>
      {selectionOpen&&<WeeklySelectionReview onScheduled={()=>void loadData()}/>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Weekly Auction Engine</h1>
          <p className="text-xs text-text-muted">
            Manage scheduled drops, monitor active live bidding, and audit settlement status.
          </p>
        </div>
        <Button
          type="button"
          variant="gold"
          size="sm"
          onClick={() => setScheduleModalOpen(true)}
          className="flex items-center gap-1.5"
        >
          <CalendarPlus className="h-4 w-4" />
          Schedule Auction Lot
        </Button>
      </div>

      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 p-3 text-xs text-emerald-400 border border-emerald-500/20">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-500/10 p-3 text-xs text-red-400 border border-red-500/20">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <Card className="flex items-center justify-center gap-2 p-12">
          <Loader2 className="h-5 w-5 animate-spin text-accent-gold" />
          <span className="text-sm text-text-muted">Loading auction lots...</span>
        </Card>
      ) : auctions.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <Gavel className="h-8 w-8 text-text-muted" />
          <h2 className="font-display text-base font-medium text-text-primary">No auctions found</h2>
          <p className="max-w-md text-xs text-text-secondary">
            No auctions or lots have been scheduled yet. Click &quot;Schedule Auction Lot&quot; to curate a new weekly featured drop.
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-surface-elevated text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Artwork ID</th>
                <th className="px-4 py-3 font-medium">Event Status</th>
                <th className="px-4 py-3 font-medium">Lot Status</th>
                <th className="px-4 py-3 font-medium">Starting Bid</th>
                <th className="px-4 py-3 font-medium">Current / Final Bid</th>
                <th className="px-4 py-3 font-medium">Total Bids</th>
                <th className="px-4 py-3 font-medium">Start & End</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {auctions.map((row) => {
                const isActionLoading = actionLoadingId === row.auctionId
                return (
                  <tr key={row.auctionItemId} className="hover:bg-surface-elevated/40">
                    <td className="px-4 py-3 font-mono text-[11px] text-text-secondary">
                      {row.artworkId.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          row.auctionStatus === 'LIVE'
                            ? 'gold'
                            : row.auctionStatus === 'ENDED'
                              ? 'neutral'
                              : row.auctionStatus === 'SCHEDULED'
                                ? 'warning'
                                : 'danger'
                        }
                        size="sm"
                      >
                        {row.auctionStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={LOT_STATUS_TONE[row.lotStatus] ?? 'neutral'} size="sm">
                        {row.lotStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-text-primary">
                      {formatAmount(row.startingBidMinor)}
                    </td>
                    <td className="px-4 py-3 font-medium text-accent-gold">
                      {row.currentHighBid > 0 ? formatAmount(row.currentHighBid) : '—'}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{row.bidCount}</td>
                    <td className="px-4 py-3 text-text-muted">
                      <div>Starts: {formatDate(row.startsAt)}</div>
                      <div>Ends: {formatDate(row.endsAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {row.auctionStatus === 'SCHEDULED' && (
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={isActionLoading}
                              onClick={() => handleActivate(row.auctionId)}
                              title="Activate to LIVE immediately"
                            >
                              <Play className="h-3.5 w-3.5" />
                              Activate
                            </Button>
                            {row.bidCount === 0 && (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="border-danger/30 text-danger hover:bg-danger/10"
                                disabled={isActionLoading}
                                onClick={() => handleCancel(row.auctionId)}
                                title="Cancel pre-bidding auction"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Cancel
                              </Button>
                            )}
                          </>
                        )}
                        <a
                          href={`/auctions/${row.auctionId}?lot=${encodeURIComponent(row.auctionItemId)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-primary-on-dark hover:underline text-[11px]"
                        >
                          View Listing
                        </a>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Schedule Auction Lot Modal */}
      <Modal
        open={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        title="Schedule Weekly Auction Lot"
      >
        <form onSubmit={handleScheduleSubmit} className="flex flex-col gap-4 text-xs">
          <div>
            <label htmlFor="auction-artwork-select" className="mb-1 block font-medium text-text-secondary">
              Select Published Artwork
            </label>
            <select
              id="auction-artwork-select"
              value={selectedArtworkId}
              onChange={(e) => handleArtworkChange(e.target.value)}
              className="w-full rounded border border-border-strong bg-surface-elevated p-2 text-text-primary focus:border-accent-gold focus:outline-none"
              required
            >
              <option value="">-- Choose an eligible artwork --</option>
              {artworks.map((art) => {
                const isActive = activeLotArtworkIds.has(art.id)
                const pricePaise = art.price ?? (art as any).price_minor ?? 0
                const available = (art.inventoryCount ?? (art as any).inventory_count ?? 1) - (art.reservedCount ?? 0)
                return (
                  <option key={art.id} value={art.id} disabled={isActive || available <= 0}>
                    {art.title} (₹{Math.round(pricePaise / 100).toLocaleString('en-IN')})
                    {isActive ? ' — [Active Auction]' : available <= 0 ? ' — [Out of Stock]' : ` — Stock: ${available}`}
                    {` — ID: ${art.id.slice(0, 8)}…`}
                  </option>
                )
              })}
            </select>
            {artworks.length === 0 && (
              <p className="mt-1 text-[11px] text-text-muted">
                No published artworks found. Artworks must be approved and published before they can be scheduled for auction.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="auction-starts-at" className="mb-1 block font-medium text-text-secondary">Starts At</label>
              <input
                id="auction-starts-at"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full rounded border border-border-strong bg-surface-elevated p-2 text-text-primary focus:border-accent-gold focus:outline-none"
                required
              />
            </div>
            <div>
              <label htmlFor="auction-ends-at" className="mb-1 block font-medium text-text-secondary">Ends At</label>
              <input
                id="auction-ends-at"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full rounded border border-border-strong bg-surface-elevated p-2 text-text-primary focus:border-accent-gold focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded bg-surface p-2 text-[11px] text-text-muted border border-border/60">
            <span className="font-medium text-text-secondary">Quick test presets:</span>
            <button
              type="button"
              className="text-accent-gold hover:underline"
              onClick={() => {
                const now = new Date()
                const start = new Date(now.getTime() + 2 * 60 * 1000)
                const end = new Date(now.getTime() + 10 * 60 * 1000)
                const toLocalInput = (d: Date) => {
                  const offset = d.getTimezoneOffset() * 60000
                  return new Date(d.getTime() - offset).toISOString().slice(0, 16)
                }
                setStartsAt(toLocalInput(start))
                setEndsAt(toLocalInput(end))
              }}
            >
              Starts in 2m (Ends in 10m)
            </button>
            <span>•</span>
            <button
              type="button"
              className="text-accent-gold hover:underline"
              onClick={() => {
                const now = new Date()
                const start = new Date(now.getTime() + 5 * 60 * 1000)
                const end = new Date(now.getTime() + 60 * 60 * 1000)
                const toLocalInput = (d: Date) => {
                  const offset = d.getTimezoneOffset() * 60000
                  return new Date(d.getTime() - offset).toISOString().slice(0, 16)
                }
                setStartsAt(toLocalInput(start))
                setEndsAt(toLocalInput(end))
              }}
            >
              Starts in 5m (Ends in 1h)
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="auction-starting-bid" className="mb-1 block font-medium text-text-secondary">
                Starting Bid (₹)
              </label>
              <input
                id="auction-starting-bid"
                type="number"
                min="1"
                value={startingBidRupees}
                onChange={(e) => setStartingBidRupees(e.target.value)}
                className="w-full rounded border border-border-strong bg-surface-elevated p-2 text-text-primary focus:border-accent-gold focus:outline-none"
                required
              />
            </div>
            <div>
              <label htmlFor="auction-bid-increment" className="mb-1 block font-medium text-text-secondary">
                Bid Increment (₹)
              </label>
              <input
                id="auction-bid-increment"
                type="number"
                min="1"
                value={bidIncrementRupees}
                onChange={(e) => setBidIncrementRupees(e.target.value)}
                className="w-full rounded border border-border-strong bg-surface-elevated p-2 text-text-primary focus:border-accent-gold focus:outline-none"
                required
              />
            </div>
            <div>
              <label htmlFor="auction-payment-window" className="mb-1 block font-medium text-text-secondary">
                Payment Window (Hours)
              </label>
              <input
                id="auction-payment-window"
                type="number"
                min="1"
                max="168"
                value={paymentWindowHours}
                onChange={(e) => setPaymentWindowHours(e.target.value)}
                className="w-full rounded border border-border-strong bg-surface-elevated p-2 text-text-primary focus:border-accent-gold focus:outline-none"
                required
              />
            </div>
          </div>

          {scheduleError && (
            <div className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{scheduleError}</span>
            </div>
          )}

          <div className="mt-2 flex justify-end gap-2 border-t border-border pt-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setScheduleModalOpen(false)}
              disabled={scheduleLoading}
            >
              Cancel
            </Button>
            <Button type="submit" variant="gold" disabled={scheduleLoading}>
              {scheduleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Schedule Auction'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

