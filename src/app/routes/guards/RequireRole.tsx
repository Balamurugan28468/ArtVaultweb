import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
import type { UserRole } from '@/features/auth/types'

/**
 * Role-gated route guard — always nested *inside* a `RequireAuth` subtree in
 * the router (see router.tsx), so by the time this renders, `status` is
 * already 'authenticated' and `role` is already resolved; this only adds
 * the role check on top. Purely a UX/redirect concern — the real authority
 * is firestore.rules, which independently rejects any write this guard
 * failed to prevent someone from attempting.
 */
export function RequireRole({ allow }: { allow: UserRole[] }) {
  const { role } = useAuth()

  if (!role || !allow.includes(role)) {
    return <Navigate to="/account" replace />
  }

  return <Outlet />
}
