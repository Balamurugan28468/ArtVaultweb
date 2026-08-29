import { Link, Outlet } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
import { SignOutButton } from '@/features/auth'

export function RootLayout() {
  const { status } = useAuth()

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <Link to="/" className="text-lg font-semibold">
          ArtVault
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {status === 'authenticated' && (
            <>
              <Link to="/account">Account</Link>
              <SignOutButton />
            </>
          )}
          {status === 'unauthenticated' && (
            <>
              <Link to="/sign-in">Sign in</Link>
              <Link to="/sign-up">Sign up</Link>
            </>
          )}
          {/* status === 'loading': render neither — avoids flashing the
              signed-out links while a real session is still being restored. */}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
