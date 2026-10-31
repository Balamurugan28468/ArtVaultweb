import { useState } from 'react'
import { ImageOff, CheckCircle, XCircle, EyeOff, RotateCcw, RotateCw } from 'lucide-react'
import { Badge, Button, Card, EmptyState, ErrorState, Input, Skeleton } from '@/shared/ui'
import { useArtistDisplayNames } from '@/features/marketplace'
import { useAllArtworks } from '../hooks/useAllArtworks'
import { useModerateArtwork } from '../hooks/useModerateArtwork'
import { useSuspendArtwork } from '../hooks/useSuspendArtwork'
import { useRestoreArtwork } from '../hooks/useRestoreArtwork'
import { ArtworkModerationLookup } from './ArtworkModerationLookup'
import { ModerationActionModal } from './ModerationActionModal'
import type { Artwork, ArtworkStatus } from '@/features/artwork'

type FilterStatus = 'ALL' | ArtworkStatus

export function AdminArtworksView() {
  const { data: artworks, status, error, refetch, isFetching } = useAllArtworks()
  const moderate = useModerateArtwork()
  const suspend = useSuspendArtwork()
  const restore = useRestoreArtwork()

  const [filter, setFilter] = useState<FilterStatus>('ALL')
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState<{
    open: boolean
    artwork: Artwork | null
    mode: 'approve' | 'reject' | 'suspend' | 'restore'
  }>({
    open: false,
    artwork: null,
    mode: 'approve',
  })

  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({})

  const artworkList = artworks ?? []
  const artistNames = useArtistDisplayNames(artworkList.map((a) => a.sellerId))

  if (status === 'pending') {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading artworks">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <ErrorState
        title="Could not load artworks"
        description={error?.message || 'Something went wrong while loading artwork moderation catalog.'}
        action={
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        }
      />
    )
  }

  const filtered = artworkList.filter((a) => {
    if (filter !== 'ALL' && a.status !== filter) return false
    const query = search.toLowerCase().trim()
    if (!query) return true
    return (
      a.title.toLowerCase().includes(query) ||
      a.category.toLowerCase().includes(query) ||
      (artistNames[a.sellerId]?.toLowerCase().includes(query) ?? false) ||
      a.id.toLowerCase().includes(query)
    )
  })

  const isBusy = moderate.isPending || suspend.isPending || restore.isPending

  function handleActionClick(artwork: Artwork, mode: 'approve' | 'reject' | 'suspend' | 'restore') {
    setDialog({ open: true, artwork, mode })
  }

  function handleConfirmDialog(reason?: string) {
    if (!dialog.artwork) return
    const id = dialog.artwork.id

    if (dialog.mode === 'approve') {
      moderate.mutate(
        { artworkId: id, decision: 'PUBLISHED' },
        { onSuccess: () => setDialog({ open: false, artwork: null, mode: 'approve' }) },
      )
    } else if (dialog.mode === 'reject') {
      moderate.mutate(
        { artworkId: id, decision: 'REJECTED', rejectionReason: reason },
        { onSuccess: () => setDialog({ open: false, artwork: null, mode: 'approve' }) },
      )
    } else if (dialog.mode === 'suspend') {
      suspend.mutate(
        { artworkId: id, reason: reason ?? '' },
        { onSuccess: () => setDialog({ open: false, artwork: null, mode: 'approve' }) },
      )
    } else if (dialog.mode === 'restore') {
      restore.mutate(id, {
        onSuccess: () => setDialog({ open: false, artwork: null, mode: 'approve' }),
      })
    }
  }

  const formatPrice = (minor: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(minor / 100)
  }

  const getStatusTone = (s: ArtworkStatus) => {
    switch (s) {
      case 'PUBLISHED':
        return 'success'
      case 'SUBMITTED':
        return 'gold'
      case 'SUSPENDED':
      case 'REJECTED':
        return 'danger'
      default:
        return 'neutral'
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Lookup Tool */}
      <ArtworkModerationLookup />

      {/* Filter and search bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {(['ALL', 'SUBMITTED', 'PUBLISHED', 'SUSPENDED', 'REJECTED', 'DRAFT'] as FilterStatus[]).map(
            (tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === tab
                    ? 'bg-brand-primary text-text-primary'
                    : 'bg-surface-muted text-text-secondary hover:text-text-primary'
                }`}
              >
                {tab}
              </button>
            ),
          )}
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Search title, artist, ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RotateCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={search || filter !== 'ALL' ? 'No matching artworks' : 'No artworks found'}
          description={
            search || filter !== 'ALL'
              ? 'Try adjusting your search terms or filter.'
              : 'Artworks submitted by sellers will appear here.'
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((artwork) => {
            const primaryImage = [...artwork.images].sort((a, b) => a.order - b.order)[0]
            const hasFailed = failedImages[artwork.id]
            const showThumb = primaryImage?.url && !hasFailed
            const artistName = artistNames[artwork.sellerId]

            return (
              <Card key={artwork.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
                {/* Secure storage thumbnail preview */}
                <div className="flex h-36 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-muted sm:h-28 sm:w-28">
                  {showThumb ? (
                    <img
                      src={primaryImage.url}
                      alt={artwork.title}
                      onError={() => setFailedImages((prev) => ({ ...prev, [artwork.id]: true }))}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageOff className="h-8 w-8 text-text-muted" aria-hidden="true" />
                  )}
                </div>

                <div className="flex flex-1 flex-col justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display text-base font-semibold text-text-primary">
                          {artwork.title}
                        </h3>
                        <p className="text-sm text-text-secondary">
                          {artistName || 'Unknown artist'} • Category: {artwork.category}
                        </p>
                      </div>
                      <Badge tone={getStatusTone(artwork.status)}>{artwork.status}</Badge>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                      <span className="font-semibold text-text-primary">
                        {formatPrice(artwork.price)}
                      </span>
                      <span>•</span>
                      <span>ID: {artwork.id}</span>
                      <span>•</span>
                      <span>Created {artwork.createdAt.toDate().toLocaleDateString()}</span>
                    </div>

                    {artwork.description && (
                      <p className="mt-2 line-clamp-2 text-xs text-text-muted">
                        {artwork.description}
                      </p>
                    )}

                    {artwork.rejectionReason && (
                      <div className="mt-2 rounded bg-surface-muted p-2 text-xs text-text-secondary">
                        <span className="font-medium text-text-primary">Moderation note: </span>
                        {artwork.rejectionReason}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
                    {artwork.status === 'SUBMITTED' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleActionClick(artwork, 'approve')}
                          disabled={isBusy}
                        >
                          <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                          Publish
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleActionClick(artwork, 'reject')}
                          disabled={isBusy}
                        >
                          <XCircle className="mr-1.5 h-3.5 w-3.5" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="border-danger/30 text-danger hover:bg-danger/10"
                          onClick={() => handleActionClick(artwork, 'suspend')}
                          disabled={isBusy}
                        >
                          <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                          Suspend
                        </Button>
                      </>
                    )}

                    {artwork.status === 'PUBLISHED' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="border-danger/30 text-danger hover:bg-danger/10"
                        onClick={() => handleActionClick(artwork, 'suspend')}
                        disabled={isBusy}
                      >
                        <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                        Hide / Suspend
                      </Button>
                    )}

                    {artwork.status === 'SUSPENDED' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleActionClick(artwork, 'restore')}
                        disabled={isBusy}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Restore to Published
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Shared Dialog */}
      <ModerationActionModal
        open={dialog.open}
        onClose={() => setDialog({ open: false, artwork: null, mode: 'approve' })}
        title={
          dialog.mode === 'approve'
            ? `Publish "${dialog.artwork?.title}"?`
            : dialog.mode === 'reject'
              ? `Reject "${dialog.artwork?.title}"?`
              : dialog.mode === 'restore'
                ? `Restore "${dialog.artwork?.title}" to Published?`
                : `Suspend "${dialog.artwork?.title}"?`
        }
        description={
          dialog.mode === 'approve'
            ? 'Publishing makes this artwork visible in Explore, Search, Wishlist, and Cart checkout.'
            : dialog.mode === 'reject'
              ? 'Rejecting archives this submission. Please provide a moderation reason.'
              : dialog.mode === 'restore'
                ? 'Restoring makes the artwork visible in the public marketplace once more.'
                : 'Suspending hides the artwork from public discovery, cart addition, and AR visualization. Stored images and order snapshots are safely preserved.'
        }
        requireReason={dialog.mode === 'reject' || dialog.mode === 'suspend'}
        confirmLabel={
          dialog.mode === 'approve'
            ? 'Publish'
            : dialog.mode === 'reject'
              ? 'Reject'
              : dialog.mode === 'restore'
                ? 'Restore'
                : 'Suspend Artwork'
        }
        isSubmitting={isBusy}
        onConfirm={handleConfirmDialog}
      />
    </div>
  )
}

