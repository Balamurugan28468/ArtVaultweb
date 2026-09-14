import { ImageOff, Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { getArtwork, type Artwork } from '@/features/artwork'
import { useArtistDisplayNames } from '@/features/marketplace'
import { Badge, type BadgeTone, Button, Card, Input } from '@/shared/ui'
import { useSuspendArtwork } from '../hooks/useSuspendArtwork'
import { ModerationActionModal } from './ModerationActionModal'

type LookupState = { status: 'idle' } | { status: 'loading' } | { status: 'found'; artwork: Artwork } | { status: 'not-found' }

const STATUS_TONE: Record<Artwork['status'], BadgeTone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'gold',
  PUBLISHED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
}

/**
 * Admin moderation override (UI-03 final correction) — the Admin Control
 * Center's only entry point for moderating an artwork that isn't in the
 * SUBMITTED queue (most concretely, "an accidentally approved PUBLISHED
 * artwork" — the example this feature was built for). Deliberately a
 * targeted by-id lookup, not a new "browse every artwork" listing: the
 * realistic trigger for this tool is a reported/flagged artwork whose id
 * an admin already has (from a report, a URL, or a complaint), and a full
 * cross-seller browse surface would be a much larger, more privacy-
 * sensitive feature than anything asked for here. `getArtwork` already
 * swallows a permission-denied read into `null` (see artworkRepository.ts)
 * — after firestore.rules' own widened admin read grant, that only
 * happens for a genuinely nonexistent id, never a real but differently-
 * permissioned artwork, since an ADMIN/SUPER_ADMIN can now read any
 * existing artwork regardless of status.
 *
 * Shows Suspend only — never Publish/Reject, which are valid exclusively
 * for a SUBMITTED artwork (`handleModerateArtwork` would simply reject
 * either as "not awaiting review" for anything else) and would be a fake,
 * near-always-failing button here otherwise.
 */
export function ArtworkModerationLookup() {
  const [artworkIdInput, setArtworkIdInput] = useState('')
  const [lookup, setLookup] = useState<LookupState>({ status: 'idle' })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const suspend = useSuspendArtwork()

  const artistNames = useArtistDisplayNames(lookup.status === 'found' ? [lookup.artwork.sellerId] : [])

  async function handleLookup(event: FormEvent) {
    event.preventDefault()
    const id = artworkIdInput.trim()
    if (!id) return
    setLookup({ status: 'loading' })
    const artwork = await getArtwork(id)
    setLookup(artwork ? { status: 'found', artwork } : { status: 'not-found' })
  }

  function handleConfirmSuspend(reason?: string) {
    if (lookup.status !== 'found' || !reason) return
    const artworkId = lookup.artwork.id
    suspend.mutate(
      { artworkId, reason },
      {
        onSuccess: async () => {
          setConfirmOpen(false)
          const refreshed = await getArtwork(artworkId)
          setLookup(refreshed ? { status: 'found', artwork: refreshed } : { status: 'not-found' })
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-medium text-text-primary">Moderate an artwork by ID</h2>
        <p className="text-sm text-text-secondary">
          Suspend any artwork — regardless of owner or current status — by its artwork ID, not just one awaiting review below.
        </p>
      </div>

      <form onSubmit={handleLookup} className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="moderation-lookup-id" className="text-sm font-medium text-text-secondary">
            Artwork ID
          </label>
          <Input
            id="moderation-lookup-id"
            value={artworkIdInput}
            onChange={(event) => setArtworkIdInput(event.target.value)}
            placeholder="e.g. aB3xYz9Qk2..."
          />
        </div>
        <Button type="submit" size="sm" disabled={lookup.status === 'loading' || artworkIdInput.trim().length === 0}>
          <Search aria-hidden="true" className="h-4 w-4" />
          Look up
        </Button>
      </form>

      {lookup.status === 'not-found' && (
        <p role="status" className="text-sm text-text-secondary">
          No artwork was found for that ID.
        </p>
      )}

      {lookup.status === 'found' && (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:p-5">
          <div className="flex h-32 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-muted sm:h-28 sm:w-28">
            {lookup.artwork.images[0] ? (
              <img src={lookup.artwork.images[0].url} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageOff className="h-8 w-8 text-text-muted" aria-hidden="true" />
            )}
          </div>

          <div className="flex flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-medium text-text-primary">{lookup.artwork.title}</h3>
                <p className="text-sm text-text-secondary">{artistNames[lookup.artwork.sellerId] ?? 'Unknown artist'}</p>
              </div>
              <Badge tone={STATUS_TONE[lookup.artwork.status]}>{lookup.artwork.status}</Badge>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
              <span>₹{(lookup.artwork.price / 100).toFixed(0)}</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{lookup.artwork.category}</span>
            </div>

            {lookup.artwork.status === 'SUSPENDED' ? (
              <p className="text-sm text-text-muted">Already suspended.</p>
            ) : (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={suspend.isPending}
                  className="text-sm font-medium text-danger hover:underline disabled:opacity-60"
                >
                  Suspend
                </button>
              </div>
            )}
          </div>
        </Card>
      )}

      <ModerationActionModal
        open={confirmOpen}
        onClose={() => {
          if (suspend.isPending) return
          setConfirmOpen(false)
        }}
        title="Suspend artwork"
        description={
          lookup.status === 'found'
            ? `"${lookup.artwork.title}" will be suspended and removed from the marketplace immediately. The listing itself is preserved, not deleted.`
            : ''
        }
        requireReason
        confirmLabel="Suspend"
        isSubmitting={suspend.isPending}
        onConfirm={handleConfirmSuspend}
      />
    </div>
  )
}
