import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'

export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <p className="p-4 text-neutral-600">Loading your session…</p>
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/sign-in" state={{ from: location.pathname }} replace />
  }

  return <Outlet />
}
