import { useAuth } from '@/app/providers/AuthProvider'
import { SignOutButton } from '@/features/auth'
import { buttonClassName, Card, PageHeader } from '@/shared/ui'

export function AccountPlaceholderPage() {
  const { user, role } = useAuth()

  return (
    <section className="flex flex-col gap-6">
      <PageHeader title="Account" />
      <Card className="p-6">
        <p className="text-text-secondary">
          Signed in as <span className="text-text-primary">{user?.email}</span> ({role ?? 'role pending'})
        </p>
        <p className="mt-1 text-sm text-text-muted">
          This page only proves the auth-guard pattern for Module 01 — the real Customer Account
          module is built later.
        </p>
        <SignOutButton className={`${buttonClassName('secondary', 'md')} mt-4`} />
      </Card>
    </section>
  )
}
