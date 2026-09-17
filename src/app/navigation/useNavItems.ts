import { useAuth } from '@/app/providers/AuthProvider'
import { NAV_ITEMS, type NavAudience, type NavItem } from './navItems'

function currentAudience(status: 'loading' | 'authenticated' | 'unauthenticated', role: NavAudience | null): NavAudience {
  return status === 'authenticated' && role ? role : 'guest'
}

/**
 * Returns only the nav items that are both genuinely implemented
 * ('available') and relevant to the current viewer. Purely a UX/display
 * concern — every destination remains independently protected by
 * RequireAuth/route guards and Firestore rules regardless of what's
 * shown here (see docs/SECURITY.md).
 */
export function useNavItems(): NavItem[] {
  const { status, role } = useAuth()
  const audience = currentAudience(status, role)

  return NAV_ITEMS.filter((item) => item.status === 'available' && item.audiences.includes(audience))
}

// UI-01 mobile bottom-nav correction: the 4 items above (home/marketplace/
// wishlist/account) fill the primary bottom-nav row; everything else lives
// behind "More" (see AppBottomNav.tsx). The owner specified an exact,
// ordered set per role — not "everything else in NAV_ITEMS" — so this reads
// specific ids out of the same single NAV_ITEMS source rather than deriving
// the list generically (which would have also pulled in `orders`, never
// requested here). `available` items (now including Auctions, UI-04) render
// as real links; `comingSoon` ones (Notifications/Help) render honestly
// disabled — same convention as everywhere else, never a dead link.
const MORE_MENU_IDS: Record<NavAudience, string[]> = {
  guest: ['auction', 'notifications', 'cart', 'help'],
  // UI-02: Orders joins Cart here, both now genuinely `available`.
  CUSTOMER: ['auction', 'notifications', 'cart', 'orders', 'help'],
  SELLER: ['auction', 'notifications', 'cart', 'orders', 'seller-studio', 'help'],
  ADMIN: ['auction', 'notifications', 'admin', 'help'],
  SUPER_ADMIN: ['auction', 'notifications', 'admin', 'help'],
}

export function useMoreMenuItems(): NavItem[] {
  const { status, role } = useAuth()
  const audience = currentAudience(status, role)
  const ids = MORE_MENU_IDS[audience]

  return ids.map((id) => NAV_ITEMS.find((item) => item.id === id)).filter((item): item is NavItem => Boolean(item))
}
