import { useAuth } from '@/app/providers/AuthProvider'
import { SignOutButton } from '@/features/auth'

export function AccountPlaceholderPage() {
  const { user, role } = useAuth()

  return (
    <section>
      <h1 className="text-xl font-semibold">Account</h1>
      <p className="mt-2 text-neutral-600">
        Signed in as {user?.email} ({role ?? 'role pending'})
      </p>
      <p className="mt-1 text-sm text-neutral-500">
        This page only proves the auth-guard pattern for Module 01 — the real Customer Account
        module is built later.
      </p>
      <SignOutButton className="mt-4 rounded border border-neutral-300 px-3 py-2 text-sm" />
    </section>
  )
}
