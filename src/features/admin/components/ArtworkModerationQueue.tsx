import { useState } from 'react'
import { useArtistDisplayNames } from '@/features/marketplace'
import { Button, EmptyState, ErrorState, Skeleton } from '@/shared/ui'
import { useModerateArtwork } from '../hooks/useModerateArtwork'
import { useSubmittedArtworks } from '../hooks/useSubmittedArtworks'
import { ArtworkModerationCard } from './ArtworkModerationCard'
import { ModerationActionModal } from './ModerationActionModal'

type Dialog = { artworkId: string; title: string; mode: 'approve' | 'reject' } | null

/**
 * The full artwork-moderation review surface — same loading/error/empty/
 * populated + shared-dialog structure as SellerApplicationQueue. Every
 * privileged write goes through useModerateArtwork, which calls the
 * `moderateArtwork` callable; this component never touches
 * artworks/{artworkId} directly.
 */
export function ArtworkModerationQueue() {
  const query = useSubmittedArtworks()
  const moderate = useModerateArtwork()
  const [dialog, setDialog] = useState<Dialog>(null)
  const artworks = query.data ?? []
  const artistNames = useArtistDisplayNames(artworks.map((artwork) => artwork.sellerId))

  if (query.status === 'pending') {
    return (
      <div aria-busy="true" aria-label="Loading submitted artworks" className="flex flex-col gap-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (query.status === 'error') {
    return (
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
  }

  if (artworks.length === 0) {
    return <EmptyState title="No artworks awaiting review" description="Newly submitted artwork will appear here for review." />
  }

  function closeDialog() {
    if (moderate.isPending) return
    setDialog(null)
  }

  function handleConfirm(reason?: string) {
    if (!dialog) return
    moderate.mutate(
      {
        artworkId: dialog.artworkId,
        decision: dialog.mode === 'approve' ? 'PUBLISHED' : 'REJECTED',
        rejectionReason: dialog.mode === 'reject' ? reason : undefined,
      },
      { onSuccess: () => setDialog(null) },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {artworks.map((artwork) => (
        <ArtworkModerationCard
          key={artwork.id}
          artwork={artwork}
          artistDisplayName={artistNames[artwork.sellerId]}
          disabled={moderate.isPending}
          onApprove={() => setDialog({ artworkId: artwork.id, title: artwork.title, mode: 'approve' })}
          onReject={() => setDialog({ artworkId: artwork.id, title: artwork.title, mode: 'reject' })}
        />
      ))}

      <ModerationActionModal
        open={dialog !== null}
        onClose={closeDialog}
        title={dialog?.mode === 'approve' ? 'Publish artwork' : 'Reject artwork'}
        description={
          dialog
            ? dialog.mode === 'approve'
              ? `"${dialog.title}" will become publicly visible on the marketplace.`
              : `"${dialog.title}" will be marked as rejected and will not be published.`
            : ''
        }
        requireReason={dialog?.mode === 'reject'}
        confirmLabel={dialog?.mode === 'approve' ? 'Publish' : 'Reject artwork'}
        isSubmitting={moderate.isPending}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
