import { useNavigate, useParams } from 'react-router'
import { ArtworkForm, useArtwork } from '@/features/artwork'
import { SellerStudioShell } from '@/features/seller-studio'
import { Card, EmptyState, ErrorState, Skeleton, useToast } from '@/shared/ui'

export function ArtworkFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  // Called unconditionally regardless of mode (rules-of-hooks) — in
  // 'create' mode `id` is always undefined, so this resolves to `missing`
  // and is simply never rendered from below.
  const artworkState = useArtwork(mode === 'edit' ? id : undefined)

  const handleSaved = () => {
    toast.success('Saved.')
    navigate('/seller-studio/artworks')
  }

  if (mode === 'create') {
    return (
      <SellerStudioShell title="Create artwork" description="Save as a draft, then submit when you're ready.">
        <Card className="p-4 sm:p-6">
          <ArtworkForm onSaved={handleSaved} />
        </Card>
      </SellerStudioShell>
    )
  }

  return (
    <SellerStudioShell title="Edit artwork">
      {artworkState.status === 'loading' && (
        <Card aria-busy="true" aria-label="Loading artwork" className="flex flex-col gap-3 p-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-24 w-full" />
        </Card>
      )}

      {artworkState.status === 'error' && (
        <ErrorState title="Couldn't load this artwork" description={artworkState.error.message} />
      )}

      {artworkState.status === 'missing' && (
        <EmptyState
          title="Artwork not found"
          description="This artwork doesn't exist, or you don't have access to it."
        />
      )}

      {artworkState.status === 'loaded' && (
        <Card className="p-4 sm:p-6">
          <ArtworkForm artwork={artworkState.artwork} onSaved={handleSaved} />
        </Card>
      )}
    </SellerStudioShell>
  )
}
