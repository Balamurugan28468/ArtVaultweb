import { useAuth } from '@/app/providers/AuthProvider'
import { ArtistProfileEditForm, useArtistProfile } from '@/features/artist-profile'
import { SellerStudioShell } from '@/features/seller-studio'
import { Card, EmptyState, ErrorState, Skeleton, useToast } from '@/shared/ui'

/**
 * Seller Studio surface for managing the two public fields on the signed-in
 * seller's own artists/{uid} profile — the only place that document is ever
 * client-editable (see ArtistProfileEditForm and firestore.rules).
 */
export function SellerProfilePage() {
  const { user } = useAuth()
  const profileState = useArtistProfile(user?.uid)
  const toast = useToast()

  const handleSaved = () => {
    toast.success('Public profile saved.')
  }

  return (
    <SellerStudioShell
      title="Public profile"
      description="Manage what customers see on your public artist page."
    >
      {profileState.status === 'loading' && (
        <Card aria-busy="true" aria-label="Loading your public profile" className="flex flex-col gap-3 p-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-24 w-full" />
        </Card>
      )}

      {profileState.status === 'error' && (
        <ErrorState title="Couldn't load your public profile" description={profileState.error.message} />
      )}

      {profileState.status === 'missing' && (
        <EmptyState
          title="Your public profile is being set up"
          description="This is created automatically once your seller application is approved. Check back in a moment, or refresh the page."
        />
      )}

      {profileState.status === 'loaded' && (
        <Card className="p-4 sm:p-6">
          <ArtistProfileEditForm profile={profileState.profile} onSaved={handleSaved} />
        </Card>
      )}
    </SellerStudioShell>
  )
}
