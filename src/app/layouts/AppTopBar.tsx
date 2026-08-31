import { Menu } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
import { BrandLogo } from '@/app/branding/BrandLogo'
import { SignOutButton } from '@/features/auth'
import { Avatar, buttonClassName, Dropdown, dropdownItemClassName, IconButton } from '@/shared/ui'

export function AppTopBar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const { status, user } = useAuth()

  return (
    <header className="sticky top-0 z-[var(--z-index-dropdown)] border-b border-border bg-bg/95 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <IconButton
          icon={<Menu className="h-5 w-5" />}
          label="Open menu"
          onClick={onOpenDrawer}
          className="lg:hidden"
        />

        <Link to="/" className="shrink-0">
          <span className="hidden sm:inline">
            <BrandLogo />
          </span>
          <span className="sm:hidden">
            <BrandLogo variant="mark" />
          </span>
        </Link>

        {/* Search intentionally omitted until the Marketplace/Search module
            ships — no disabled placeholder pretending to be a real feature. */}

        <div className="ml-auto flex items-center gap-2">
          {status === 'authenticated' && user ? (
            <Dropdown
              align="end"
              trigger={({ onClick }) => (
                <button
                  type="button"
                  onClick={onClick}
                  aria-label="Account menu"
                  className="flex items-center gap-2 rounded-md p-1 hover:bg-surface-elevated"
                >
                  <Avatar name={user.displayName ?? user.email ?? 'Account'} photoURL={user.photoURL} size="sm" />
                </button>
              )}
            >
              <Link to="/account" className={dropdownItemClassName}>
                Account
              </Link>
              <div className="px-1 py-1">
                <SignOutButton className={`${dropdownItemClassName} justify-start`} />
              </div>
            </Dropdown>
          ) : (
            status === 'unauthenticated' && (
              // Hidden below `sm` — the drawer (opened via the hamburger)
              // already offers Sign in/Sign up there, so the header stays
              // to just hamburger + brand on narrow phones instead of
              // crowding hamburger + logo + two links into one row.
              <div className="hidden items-center gap-2 sm:flex">
                <Link to="/sign-in" className={buttonClassName('ghost', 'sm')}>
                  Sign in
                </Link>
                <Link to="/sign-up" className={buttonClassName('primary', 'sm')}>
                  Sign up
                </Link>
              </div>
            )
          )}
        </div>
      </div>
    </header>
  )
}
