import { useState, type ReactNode } from 'react'
import { useArtistDisplayNames } from '@/features/marketplace'
import { Button, EmptyState, ErrorState, Skeleton } from '@/shared/ui'
import { useModerateArtwork } from '../hooks/useModerateArtwork'
import { useSubmittedArtworks } from '../hooks/useSubmittedArtworks'
import { useSuspendArtwork } from '../hooks/useSuspendArtwork'
import { ArtworkModerationCard } from './ArtworkModerationCard'
import { ArtworkModerationLookup } from './ArtworkModerationLookup'
import { ModerationActionModal } from './ModerationActionModal'

type Dialog = { artworkId: string; title: string; mode: 'approve' | 'reject' | 'suspend' } | null

/**
 * The full artwork-moderation review surface — same loading/error/empty/
 * populated + shared-dialog structure as SellerApplicationQueue. Every
 * privileged write goes through useModerateArtwork/useSuspendArtwork,
 * which call the `moderateArtwork`/`suspendArtwork` callables; this
 * component never touches artworks/{artworkId} directly.
 *
 * `ArtworkModerationLookup` (admin moderation override, UI-03 final
 * correction) renders unconditionally above the SUBMITTED queue itself —
 * it targets any artwork by id regardless of status, so it must stay
 * visible even while the queue is loading, empty, or errored, not just
 * once it has real SUBMITTED rows to show.
 */
export function ArtworkModerationQueue() {
  const query = useSubmittedArtworks()
  const moderate = useModerateArtwork()
  const suspend = useSuspendArtwork()
  const [dialog, setDialog] = useState<Dialog>(null)
  const artworks = query.data ?? []
  const artistNames = useArtistDisplayNames(artworks.map((artwork) => artwork.sellerId))
  const busy = moderate.isPending || suspend.isPending

  function closeDialog() {
    if (busy) return
    setDialog(null)
  }

  function handleConfirm(reason?: string) {
    if (!dialog) return
    if (dialog.mode === 'suspend') {
      suspend.mutate({ artworkId: dialog.artworkId, reason: reason ?? '' }, { onSuccess: () => setDialog(null) })
      return
    }
    moderate.mutate(
      {
        artworkId: dialog.artworkId,
        decision: dialog.mode === 'approve' ? 'PUBLISHED' : 'REJECTED',
        rejectionReason: dialog.mode === 'reject' ? reason : undefined,
      },
      { onSuccess: () => setDialog(null) },
    )
  }

  let queueContent: ReactNode
  if (query.status === 'pending') {
    queueContent = (
      <div aria-busy="true" aria-label="Loading submitted artworks" className="flex flex-col gap-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  } else if (query.status === 'error') {
    queueContent = (
      <ErrorState
        title="Couldn't load artworks awaiting review"
        description="Something went wrong while loading the moderation queue."
        action={
          <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
            Try again
          </Button>
        }
      />
    )
  } else if (artworks.length === 0) {
    queueContent = <EmptyState title="No artworks awaiting review" description="Newly submitted artwork will appear here for review." />
  } else {
    queueContent = (
      <div className="flex flex-col gap-4">
        {artworks.map((artwork) => (
          <ArtworkModerationCard
            key={artwork.id}
            artwork={artwork}
            artistDisplayName={artistNames[artwork.sellerId]}
            disabled={busy}
            onApprove={() => setDialog({ artworkId: artwork.id, title: artwork.title, mode: 'approve' })}
            onReject={() => setDialog({ artworkId: artwork.id, title: artwork.title, mode: 'reject' })}
            onSuspend={() => setDialog({ artworkId: artwork.id, title: artwork.title, mode: 'suspend' })}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <ArtworkModerationLookup />
      <div className="border-t border-border pt-6">
        <h2 className="mb-4 font-display text-lg font-medium text-text-primary">Awaiting review</h2>
        {queueContent}
      </div>

      <ModerationActionModal
        open={dialog !== null}
        onClose={closeDialog}
        title={dialog?.mode === 'approve' ? 'Publish artwork' : dialog?.mode === 'suspend' ? 'Suspend artwork' : 'Reject artwork'}
        description={
          dialog
            ? dialog.mode === 'approve'
              ? `"${dialog.title}" will become publicly visible on the marketplace.`
              : dialog.mode === 'suspend'
                ? `"${dialog.title}" will be suspended and removed from the marketplace immediately. The listing itself is preserved, not deleted.`
                : `"${dialog.title}" will be marked as rejected and will not be published.`
            : ''
        }
        requireReason={dialog?.mode === 'reject' || dialog?.mode === 'suspend'}
        confirmLabel={dialog?.mode === 'approve' ? 'Publish' : dialog?.mode === 'suspend' ? 'Suspend' : 'Reject artwork'}
        isSubmitting={busy}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
