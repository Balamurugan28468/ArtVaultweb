import { useParams } from 'react-router'
import { PublicArtistArtworks, PublicArtistHeader, useArtistProfile } from '@/features/artist-profile'
import { Card, Container, EmptyState, ErrorState, Skeleton } from '@/shared/ui'

/**
 * ArtVault's first genuinely public route (see router.tsx — deliberately
 * not nested inside RequireAuth). Works whether or not anyone is signed
 * in, matching firestore.rules' `allow read: if true` on artists/{uid}.
 */
export function ArtistProfilePage() {
  const { artistId } = useParams()
  const profileState = useArtistProfile(artistId)

  return (
    <Container>
      <section className="flex flex-col gap-6">
        {profileState.status === 'loading' && (
          <Card aria-busy="true" aria-label="Loading artist profile" className="flex flex-col gap-3 p-6">
            <Skeleton className="h-14 w-14 rounded-full" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-16 w-full" />
          </Card>
        )}

        {profileState.status === 'error' && (
          <ErrorState title="Couldn't load this artist profile" description={profileState.error.message} />
        )}

        {profileState.status === 'missing' && (
          <EmptyState
            title="Artist not found"
            description="This artist profile doesn't exist, or hasn't been published yet."
          />
        )}

        {profileState.status === 'loaded' && (
          <>
            <PublicArtistHeader profile={profileState.profile} />
            <PublicArtistArtworks artistId={profileState.profile.uid} />
          </>
        )}
      </section>
    </Container>
  )
}
