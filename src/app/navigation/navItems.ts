import { Bell, Gavel, Grid2x2, Heart, HelpCircle, Home, LayoutDashboard, Package, ShieldCheck, ShoppingCart, User } from 'lucide-react'
import type { ComponentType } from 'react'
import type { UserRole } from '@/features/auth/types'

export type NavAudience = 'guest' | UserRole

export interface NavItem {
  id: string
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
  /**
   * 'available' items render as real clickable navigation. 'comingSoon'
   * items exist in this config for future modules to flip on, but are
   * never rendered — no dead links, no placeholder pages built just to
   * make a link "work" (see ARTVAULT_PROJECT_STATE.md → Module 02
   * planning decisions).
   */
  status: 'available' | 'comingSoon'
  audiences: NavAudience[]
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', href: '/', icon: Home, status: 'available', audiences: ['guest', 'CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'] },
  // UI-01 mobile correction: Explore already owns category discovery (its
  // own category strip + sidebar filter, both real, since the reference-
  // structured Explore rebuild) — a separate "Categories" primary nav item
  // duplicated that same destination under a second label. Removed here
  // rather than left `comingSoon` (which would still be a dead nav entry);
  // `/categories` itself now redirects to `/explore` (see router.tsx) so no
  // bookmarked/shared link breaks.
  { id: 'marketplace', label: 'Explore', href: '/explore', icon: Grid2x2, status: 'available', audiences: ['guest', 'CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'] },
  // UI-04: Auctions is now a real, working page (see AuctionsPage) —
  // flipped from `comingSoon` to `available`, href corrected to the
  // actual registered route (`/auctions`, plural — the previous
  // `/auction` was only ever a placeholder href for a page that didn't
  // exist yet).
  { id: 'auction', label: 'Auctions', href: '/auctions', icon: Gavel, status: 'available', audiences: ['guest', 'CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'] },
  { id: 'wishlist', label: 'Wishlist', href: '/wishlist', icon: Heart, status: 'available', audiences: ['guest', 'CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'] },
  // UI-02: Cart and Orders are now real, functional pages (see CartPage,
  // OrdersPage) — flipped from `comingSoon` to `available`. Audiences
  // unchanged from the UI-01 placeholder: CUSTOMER/SELLER only, since
  // ADMIN/SUPER_ADMIN have no commerce identity of their own to shop or
  // order with (same reasoning AccountSections' SellerSectionCard already
  // applies to "Become a seller").
  { id: 'cart', label: 'Cart', href: '/cart', icon: ShoppingCart, status: 'available', audiences: ['CUSTOMER', 'SELLER'] },
  { id: 'orders', label: 'Orders', href: '/orders', icon: Package, status: 'available', audiences: ['CUSTOMER', 'SELLER'] },
  { id: 'account', label: 'Account', href: '/account', icon: User, status: 'available', audiences: ['CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'] },
  { id: 'seller-studio', label: 'Seller Studio', href: '/seller-studio', icon: LayoutDashboard, status: 'available', audiences: ['SELLER'] },
  { id: 'admin', label: 'Admin Control Center', href: '/admin', icon: ShieldCheck, status: 'available', audiences: ['ADMIN', 'SUPER_ADMIN'] },
  // Both added for the mobile "More" menu (UI-01) — genuine NAV_ITEMS
  // entries, not a second hardcoded list, so this stays the one place any
  // nav surface reads a destination's label/icon/href from. Neither has a
  // real page yet, so both stay `comingSoon` (never rendered as a live
  // link by useNavItems) and appear in "More" as honestly-disabled rows.
  { id: 'notifications', label: 'Notifications', href: '/notifications', icon: Bell, status: 'comingSoon', audiences: ['guest', 'CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'] },
  { id: 'help', label: 'Help', href: '/help', icon: HelpCircle, status: 'comingSoon', audiences: ['guest', 'CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'] },
]
