import { AccountHeader, AccountSections, useUserProfile } from '@/features/account'
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/shared/ui'

export function AccountPage() {
  const state = useUserProfile()

  return (
    <section className="flex flex-col gap-6">
      <PageHeader title="Account" description="Manage your ArtVault profile." />

      {state.status === 'loading' && (
        <Card aria-busy="true" aria-label="Loading your account" className="flex items-center gap-4 p-6">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </Card>
      )}

      {state.status === 'error' && (
        <ErrorState title="Couldn't load your account" description={state.error.message} />
      )}

      {state.status === 'missing' && (
        <EmptyState
          title="No profile found"
          description="We couldn't find your ArtVault profile. Try signing out and back in — if this keeps happening, contact support."
        />
      )}

      {state.status === 'loaded' && (
        <>
          <AccountHeader profile={state.profile} />
          <AccountSections />
        </>
      )}
    </section>
  )
}
