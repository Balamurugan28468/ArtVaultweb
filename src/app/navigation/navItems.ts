import { Gavel, Grid2x2, Heart, Home, LayoutDashboard, Package, ShieldCheck, ShoppingCart, User } from 'lucide-react'
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
  { id: 'marketplace', label: 'Explore', href: '/explore', icon: Grid2x2, status: 'available', audiences: ['guest', 'CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'] },
  { id: 'categories', label: 'Categories', href: '/categories', icon: Grid2x2, status: 'comingSoon', audiences: ['guest', 'CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'] },
  { id: 'auction', label: 'Auction', href: '/auction', icon: Gavel, status: 'comingSoon', audiences: ['guest', 'CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'] },
  { id: 'wishlist', label: 'Wishlist', href: '/wishlist', icon: Heart, status: 'comingSoon', audiences: ['CUSTOMER', 'SELLER'] },
  { id: 'cart', label: 'Cart', href: '/cart', icon: ShoppingCart, status: 'comingSoon', audiences: ['CUSTOMER', 'SELLER'] },
  { id: 'orders', label: 'Orders', href: '/orders', icon: Package, status: 'comingSoon', audiences: ['CUSTOMER', 'SELLER'] },
  { id: 'account', label: 'Account', href: '/account', icon: User, status: 'available', audiences: ['CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'] },
  { id: 'seller-studio', label: 'Seller Studio', href: '/seller-studio', icon: LayoutDashboard, status: 'available', audiences: ['SELLER'] },
  { id: 'admin', label: 'Admin Control Center', href: '/admin', icon: ShieldCheck, status: 'comingSoon', audiences: ['ADMIN', 'SUPER_ADMIN'] },
]
