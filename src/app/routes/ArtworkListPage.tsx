import { Link } from 'react-router'
import { ArtworkList, useSellerArtworks } from '@/features/artwork'
import { SellerStudioShell } from '@/features/seller-studio'
import { buttonClassName, Card, EmptyState, ErrorState, Skeleton } from '@/shared/ui'

export function ArtworkListPage() {
  const state = useSellerArtworks()

  return (
    <SellerStudioShell
      title="My Artworks"
      description="Everything you've created — drafts and submitted work."
      actions={
        <Link to="/seller-studio/artworks/new" className={buttonClassName('primary', 'md')}>
          Create Artwork
        </Link>
      }
    >
      {state.status === 'loading' && (
        <Card aria-busy="true" aria-label="Loading your artworks" className="flex flex-col gap-3 p-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
        </Card>
      )}

      {state.status === 'error' && <ErrorState title="Couldn't load your artworks" description={state.error.message} />}

      {state.status === 'loaded' && state.artworks.length === 0 && (
        <EmptyState
          title="No artworks yet"
          description="Create your first artwork draft to get started."
          action={
            <Link to="/seller-studio/artworks/new" className={buttonClassName('primary', 'md')}>
              Create Artwork
            </Link>
          }
        />
      )}

      {state.status === 'loaded' && state.artworks.length > 0 && <ArtworkList artworks={state.artworks} />}
    </SellerStudioShell>
  )
}
