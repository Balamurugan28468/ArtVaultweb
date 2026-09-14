import { Bell, Heart, Menu, ShoppingCart } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
import { useNavItems } from '@/app/navigation/useNavItems'
import { BrandLogo } from '@/app/branding/BrandLogo'
import { SignOutButton } from '@/features/auth'
import { useCart } from '@/features/cart'
import { Avatar, buttonClassName, Dropdown, dropdownItemClassName, IconButton, SearchInput, Skeleton } from '@/shared/ui'

// Rendered inline in the top bar, not `home`/`wishlist`/`cart`/`account` —
// `home` is redundant with the logo (which already links to "/"),
// `wishlist` and `cart` (UI-02) each already have their own dedicated icon
// just to the right (with Cart's own item-count badge), and `account`
// lives in the avatar menu. Whatever remains (Explore, Orders for
// CUSTOMER/SELLER, and Seller Studio/Admin for the roles that have them)
// is exactly the "consumer marketplace nav" the owner's own visual review
// asked for, sourced from the same single `NAV_ITEMS` list everything else
// already uses — never a second, independently-maintained nav definition.
const TOP_BAR_HIDDEN_IDS = new Set(['home', 'wishlist', 'cart', 'account'])

export function AppTopBar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const { status, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const navItems = useNavItems().filter((item) => !TOP_BAR_HIDDEN_IDS.has(item.id))
  const [searchValue, setSearchValue] = useState('')
  // CartProvider is mounted for every visitor (guest or signed-in, see
  // main.tsx) — itemCount reflects a guest's local cart too, matching
  // Cart itself being genuinely public (UI-02).
  const { itemCount } = useCart()

  // UI-01 — a real shortcut into Explore's own (already-real) search/filter
  // handling, not a second search implementation: this only ever navigates,
  // it never queries anything itself. Desktop-only (hidden below `lg`) —
  // Explore's own in-page search field already covers mobile, and the top
  // bar has no room to spare at narrow widths (see the hamburger/logo pair
  // it's already down to on phones).
  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = searchValue.trim()
    navigate(query ? `/explore?q=${encodeURIComponent(query)}` : '/explore')
  }

  return (
    <header className="sticky top-0 z-[var(--z-index-dropdown)] border-b border-border bg-bg/95 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-3 xs:px-4 sm:h-16 sm:px-6 lg:px-8">
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

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.id}
                to={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ease-standard ${
                  isActive ? 'text-brand-primary-on-dark' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Hidden on Explore itself — that page already has its own
            dedicated, live-filtering search field (see MarketplacePage),
            and showing both at once read as an awkward duplicate (real
            owner feedback). This one stays everywhere else as a real
            shortcut into Explore. */}
        {location.pathname !== '/explore' && (
          <form role="search" onSubmit={handleSearchSubmit} className="hidden max-w-xs flex-1 lg:block">
            <SearchInput
              aria-label="Search artworks"
              placeholder="Search artworks…"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
            />
          </form>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/wishlist"
            aria-label="Wishlist"
            title="Wishlist"
            className="hidden h-11 w-11 items-center justify-center rounded-md text-text-secondary transition-colors duration-150 ease-standard hover:bg-surface-elevated hover:text-text-primary sm:inline-flex"
          >
            <Heart className="h-5 w-5" aria-hidden="true" />
          </Link>
          {/* Cart is now a real page (UI-02) — genuinely public, same as
              the Wishlist link just above it. Notifications stays
              honestly disabled: no feature exists behind it yet. Hidden
              on the smallest phones alongside Wishlist to keep the header
              from crowding. */}
          <Link
            to="/cart"
            aria-label={itemCount > 0 ? `Cart, ${itemCount} item${itemCount === 1 ? '' : 's'}` : 'Cart'}
            title="Cart"
            className="relative hidden h-11 w-11 items-center justify-center rounded-md text-text-secondary transition-colors duration-150 ease-standard hover:bg-surface-elevated hover:text-text-primary sm:inline-flex"
          >
            <ShoppingCart className="h-5 w-5" aria-hidden="true" />
            {itemCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-gold px-1 text-[10px] font-semibold text-text-on-light"
              >
                {itemCount > 99 ? '99+' : itemCount}
              </span>
            )}
          </Link>
          <span
            aria-disabled="true"
            title="Notifications — coming soon"
            className="hidden h-11 w-11 cursor-not-allowed items-center justify-center rounded-md text-text-muted opacity-60 sm:inline-flex"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
          </span>
          {status === 'loading' && (
            // Real regression fix: this slot previously rendered nothing at
            // all while status is 'loading' (AuthProvider's own initial
            // state — see its comment on why resolving it is genuinely
            // asynchronous, not instant). A manual reviewer refreshing the
            // page can and did catch that gap as "the sign-in/account
            // controls disappeared." This skeleton commits to neither a
            // signed-in nor signed-out guess (which would risk a wrong-state
            // flash) — it's an honest loading placeholder, sized to roughly
            // match the avatar button so nothing shifts once the real state
            // resolves a moment later.
            <span aria-label="Loading account status" role="status">
              <Skeleton className="h-9 w-9 rounded-full" />
            </span>
          )}
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
              // already offers Sign in/Create Account there, so the header
              // stays to just hamburger + brand on narrow phones instead of
              // crowding hamburger + logo + two links into one row.
              // Create Account is `gold` (the marketplace-CTA color), not
              // `primary` (purple, reserved product-wide for AI) — an owner
              // correction this round.
              <div className="hidden items-center gap-2 sm:flex">
                <Link to="/sign-in" className={buttonClassName('ghost', 'sm')}>
                  Sign in
                </Link>
                <Link to="/sign-up" className={buttonClassName('gold', 'sm')}>
                  Create Account
                </Link>
              </div>
            )
          )}
        </div>
      </div>
    </header>
  )
}
