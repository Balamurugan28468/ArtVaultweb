import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
import type { UserRole } from '@/features/auth/types'

/**
 * Role-gated route guard — always nested *inside* a `RequireAuth` subtree in
 * the router (see router.tsx), so by the time this renders, `status` is
 * already 'authenticated' and `role` is already resolved; this only adds
 * the role check on top. Purely a UX/redirect concern — the real authority
 * is Supabase PostgreSQL RLS and protected RPCs, which reject unauthorized
 * access regardless of this client-side route guard.
 */
export function RequireRole({ allow }: { allow: UserRole[] }) {
  const { role } = useAuth()

  if (!role || !allow.includes(role)) {
    return <Navigate to="/account" replace />
  }

  return <Outlet />
}
