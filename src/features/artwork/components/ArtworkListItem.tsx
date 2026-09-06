import { useState } from 'react'
import { Link } from 'react-router'
import { ConfirmDeleteDraftModal } from './ConfirmDeleteDraftModal'
import { useUpdateArtwork } from '../hooks/useUpdateArtwork'
import type { Artwork } from '../types'
import { Badge, Card, useToast } from '@/shared/ui'

export function ArtworkListItem({ artwork }: { artwork: Artwork }) {
  const isSubmitted = artwork.status === 'SUBMITTED'
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const { remove, status } = useUpdateArtwork()
  const toast = useToast()

  const handleConfirmDelete = async () => {
    try {
      await remove(artwork.id, artwork.images)
      setConfirmDeleteOpen(false)
      toast.success('Draft deleted.')
    } catch (error) {
      setConfirmDeleteOpen(false)
      toast.error(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
    }
  }

  return (
    <Card className="flex flex-col gap-2 p-4 transition-colors hover:border-brand-primary">
      <Link to={`/seller-studio/artworks/${artwork.id}/edit`} className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-medium text-text-primary">{artwork.title}</h3>
          <Badge tone={isSubmitted ? 'success' : 'neutral'}>{isSubmitted ? 'Submitted' : 'Draft'}</Badge>
        </div>
        <p className="text-sm text-text-secondary">₹{(artwork.price / 100).toFixed(0)}</p>
        <p className="text-xs text-text-muted">{artwork.inventoryCount} in stock</p>
      </Link>
      {!isSubmitted && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="text-sm font-medium text-danger hover:underline"
          >
            Delete draft
          </button>
        </div>
      )}
      <ConfirmDeleteDraftModal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
        busy={status === 'saving'}
      />
    </Card>
  )
}
