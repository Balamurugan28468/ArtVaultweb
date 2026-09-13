import { LogIn, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
import { useMoreMenuItems, useNavItems } from '@/app/navigation/useNavItems'
import { Drawer } from '@/shared/ui'

// useNavItems() returns every genuinely `available` item for the current
// role — for a SELLER that already includes Seller Studio, for an ADMIN it
// includes Admin Control Center, on top of Home/Explore/Wishlist/Account.
// The primary row below must stay at exactly these 4 (plus Sign
// in/More) regardless of role, so it explicitly allowlists them rather than
// rendering "whatever useNavItems returns" — everything else genuinely
// available per role (Seller Studio, Admin Control Center) still surfaces,
// just inside "More" (see useMoreMenuItems), never by growing this row.
const PRIMARY_BOTTOM_NAV_IDS = new Set(['home', 'marketplace', 'wishlist', 'account'])

/**
 * UI-01 mobile correction: the bottom nav previously grew by one tab for
 * every role-gated nav item that became genuinely available (Account,
 * Seller Studio, Admin Control Center, plus the always-present guest
 * Sign-in tab) — a SELLER or ADMIN could reach 5-6+ tabs, overcrowding the
 * one navigation surface with the least room to spare. This caps the
 * primary row at exactly 5 slots (Home, Explore, Wishlist, Account/Sign in,
 * More) for every role, moving every secondary destination into "More"
 * (see useMoreMenuItems) instead of growing the row per role.
 */
export function AppBottomNav() {
  const { status } = useAuth()
  const items = useNavItems().filter((item) => PRIMARY_BOTTOM_NAV_IDS.has(item.id))
  const moreItems = useMoreMenuItems()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <>
      <nav
        aria-label="Primary"
        className="shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:hidden"
      >
        <div className="flex h-14 items-stretch justify-around sm:h-16">
          {items.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.id}
                to={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-w-11 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] sm:gap-1 sm:text-xs ${
                  isActive ? 'text-brand-primary-on-dark' : 'text-text-secondary'
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            )
          })}
          {status === 'unauthenticated' && (
            <Link
              to="/sign-in"
              className="flex min-w-11 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-text-secondary sm:gap-1 sm:text-xs"
            >
              <LogIn className="h-5 w-5" />
              Sign in
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            className="flex min-w-11 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-text-secondary sm:gap-1 sm:text-xs"
          >
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>

      <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} title="More" side="right">
        <div className="flex flex-col gap-1">
          {moreItems.map((item) =>
            item.status === 'available' ? (
              <Link
                key={item.id}
                to={item.href}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 rounded-md px-2 py-2.5 text-sm text-text-primary hover:bg-surface"
              >
                <item.icon className="h-5 w-5 text-text-secondary" />
                {item.label}
              </Link>
            ) : (
              <span
                key={item.id}
                aria-disabled="true"
                title={`${item.label} — coming soon`}
                className="flex cursor-not-allowed items-center gap-3 rounded-md px-2 py-2.5 text-sm text-text-muted opacity-60"
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </span>
            ),
          )}
        </div>
      </Drawer>
    </>
  )
}
