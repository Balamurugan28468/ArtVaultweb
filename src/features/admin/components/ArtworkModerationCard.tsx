import { ImageOff } from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, Card } from '@/shared/ui'
import type { Artwork } from '@/features/artwork'

export function ArtworkModerationCard({
  artwork,
  artistDisplayName,
  onApprove,
  onReject,
  onSuspend,
  disabled,
}: {
  artwork: Artwork
  artistDisplayName: string | null | undefined
  onApprove: () => void
  onReject: () => void
  /**
   * Admin moderation override (UI-03 final correction) — a third outcome
   * alongside Publish/Reject, for a SUBMITTED artwork an admin wants to
   * remove from consideration entirely (e.g. it was already flagged for a
   * policy violation) rather than simply decide on its content. Optional
   * so this card stays usable anywhere Suspend isn't wired up.
   */
  onSuspend?: () => void
  disabled: boolean
}) {
  const primaryImage = [...artwork.images].sort((a, b) => a.order - b.order)[0]
  // Same convention as PublicArtworkCard.tsx: a missing image and a real
  // load failure (an image entry exists but its URL 404s/is invalid) both
  // fall back to the same ImageOff placeholder — never the browser's native
  // broken-image icon, which a bare <img> with no onError handler would
  // otherwise show for the second case.
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = primaryImage && !imageFailed

  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:p-6">
      <div className="flex h-40 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-muted sm:h-32 sm:w-32">
        {showImage ? (
          <img
            src={primaryImage.url}
            alt=""
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageOff className="h-8 w-8 text-text-muted" aria-hidden="true" />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-medium text-text-primary">{artwork.title}</h3>
            <p className="text-sm text-text-secondary">{artistDisplayName ?? 'Unknown artist'}</p>
          </div>
          <Badge tone="gold">Awaiting review</Badge>
        </div>

        <p className="line-clamp-3 text-sm text-text-secondary">{artwork.description}</p>

        <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
          <span>₹{(artwork.price / 100).toFixed(0)}</span>
          <span aria-hidden="true">·</span>
          <span className="capitalize">{artwork.category}</span>
          <span aria-hidden="true">·</span>
          <span>Updated {artwork.updatedAt.toDate().toLocaleDateString()}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button size="sm" onClick={onApprove} disabled={disabled}>
            Publish
          </Button>
          <Button size="sm" variant="secondary" onClick={onReject} disabled={disabled}>
            Reject
          </Button>
          {onSuspend && (
            <button
              type="button"
              onClick={onSuspend}
              disabled={disabled}
              className="text-sm font-medium text-danger hover:underline disabled:opacity-60"
            >
              Suspend
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}
