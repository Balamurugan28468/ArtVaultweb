import { SellerApplicationForm, SellerStatusCard, useSellerStatus } from '@/features/seller-studio'
import { Card, ErrorState, PageHeader, Skeleton, useToast } from '@/shared/ui'

export function SellerApplicationPage() {
  const state = useSellerStatus()
  const toast = useToast()

  return (
    <section className="mx-auto flex max-w-lg flex-col gap-6">
      <PageHeader title="Become a seller" description="Apply to start selling your work on ArtVault." />

      {state.status === 'loading' && (
        <Card aria-busy="true" aria-label="Loading your seller status" className="flex flex-col gap-3 p-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </Card>
      )}

      {state.status === 'error' && (
        <ErrorState title="Couldn't load your seller status" description={state.error.message} />
      )}

      {state.status === 'not-applied' && (
        <Card className="p-4 sm:p-6">
          <SellerApplicationForm onSuccess={() => toast.success('Application submitted.')} />
        </Card>
      )}

      {(state.status === 'pending' || state.status === 'approved') && (
        <SellerStatusCard application={state.application} />
      )}
    </section>
  )
}
