import { Bell, CreditCard, Heart, LogOut, MapPin, Package, Settings, ShieldCheck, Star, Store } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
import { SignOutButton } from '@/features/auth'
import { useSellerStatus } from '@/features/seller-studio'

interface FutureSection {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
}

// Reserves the account information architecture for later modules without
// any fake/dead functionality — each renders as a genuinely disabled native
// <button>, not a clickable "coming soon" affordance (see
// ARTVAULT_PROJECT_STATE.md → Module 02 planning decisions, applied here).
// 'seller' is absent as of Module 04 (real SellerSectionCard below);
// 'orders'/'wishlist' are absent as of UI-02 (real OrdersSectionCard /
// WishlistSectionCard below) — 'addresses' stays here: no `addresses`
// Firestore collection exists anywhere in this codebase (Checkout's own
// shipping-address form is deliberately session-only, never persisted —
// see features/checkout/schemas.ts), so there is genuinely nothing for an
// "Addresses" page to manage yet.
const FUTURE_SECTIONS: FutureSection[] = [
  { id: 'addresses', label: 'Addresses', icon: MapPin },
  { id: 'payment-methods', label: 'Payment methods', icon: CreditCard },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const TILE_CLASSES =
  'flex flex-col items-start gap-2 rounded-xl border border-border bg-surface p-4 text-left shadow-card transition-colors hover:border-brand-primary'
const TILE_CLASSES_DISABLED =
  'flex cursor-not-allowed flex-col items-start gap-2 rounded-xl border border-border bg-surface p-4 text-left opacity-60 shadow-card'

/**
 * The one genuinely functional entry in this grid — everything else stays a
 * disabled placeholder. Label/destination/subtext all reflect the real
 * seller-application state (never-applied / pending / approved), so this
 * never implies more access than the viewer actually has.
 *
 * ADMIN/SUPER_ADMIN never see this card at all — "Become a seller" is a
 * CUSTOMER-facing growth action, not a real account action for a platform
 * administrator, and prior to this fix it rendered for any signed-in role
 * with no `sellers/{uid}` document at all (useSellerStatus has no concept
 * of role — it only reflects application state), which showed the same
 * generic "Become a seller" invite to an ADMIN as to a real customer.
 * Sourced from the verified Auth custom claim (useAuth().role), never a
 * Firestore-mirrored field, matching how every privileged/role-gated
 * decision in this app is made.
 */
function SellerSectionCard() {
  const { role } = useAuth()
  const state = useSellerStatus()

  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return null
  }

  if (state.status === 'loading' || state.status === 'error') {
    return (
      <div aria-hidden="true" className={TILE_CLASSES_DISABLED}>
        <Store aria-hidden="true" className="h-5 w-5 text-text-muted" />
        <span className="text-sm font-medium text-text-primary">Become a seller</span>
        <span className="text-xs text-text-muted">Loading…</span>
      </div>
    )
  }

  const { href, subtext } =
    state.status === 'approved'
      ? { href: '/seller-studio', subtext: 'Manage your shop' }
      : state.status === 'pending'
        ? { href: '/seller/apply', subtext: 'Pending review' }
        : state.status === 'rejected'
          ? { href: '/seller/apply', subtext: 'Application not approved' }
          : { href: '/seller/apply', subtext: 'Start selling on ArtVault' }
  const label = state.status === 'approved' ? 'Seller Studio' : 'Become a seller'

  return (
    <Link to={href} className={TILE_CLASSES}>
      <Store aria-hidden="true" className="h-5 w-5 text-brand-primary" />
      <span className="text-sm font-medium text-text-primary">{label}</span>
      <span className="text-xs text-text-muted">{subtext}</span>
    </Link>
  )
}

/**
 * UI-02 — a real entry point into My Orders. CUSTOMER/SELLER only, same
 * audience restriction Cart/Orders already carry everywhere else in the
 * app (top bar, bottom nav "More" menu — see navItems.ts) — an
 * ADMIN/SUPER_ADMIN has no commerce identity of their own to place or view
 * orders with, so this tile simply doesn't exist for them, never a
 * disabled placeholder implying it someday will.
 */
function OrdersSectionCard() {
  const { role } = useAuth()
  if (role !== 'CUSTOMER' && role !== 'SELLER') return null

  return (
    <Link to="/orders" className={TILE_CLASSES}>
      <Package aria-hidden="true" className="h-5 w-5 text-accent-gold" />
      <span className="text-sm font-medium text-text-primary">Orders</span>
      <span className="text-xs text-text-muted">Track and review your orders</span>
    </Link>
  )
}

/** UI-02 — Wishlist is available to every signed-in role, same as its own nav entry (navItems.ts). */
function WishlistSectionCard() {
  return (
    <Link to="/wishlist" className={TILE_CLASSES}>
      <Heart aria-hidden="true" className="h-5 w-5 text-brand-primary" />
      <span className="text-sm font-medium text-text-primary">Wishlist</span>
      <span className="text-xs text-text-muted">Artworks you've saved</span>
    </Link>
  )
}

/** A real sign-out entry point on the Account page itself, alongside the top bar/drawer's own — same SignOutButton, not a second implementation. */
function SignOutSectionCard() {
  return (
    <SignOutButton
      className={`${TILE_CLASSES} w-full hover:border-danger/60 hover:text-danger`}
    >
      <LogOut aria-hidden="true" className="h-5 w-5 text-text-muted" />
      <span className="text-sm font-medium text-text-primary">Sign out</span>
    </SignOutButton>
  )
}

export function AccountSections() {
  return (
    <section aria-labelledby="account-sections-heading" className="flex flex-col gap-3">
      <h2 id="account-sections-heading" className="text-sm font-medium text-text-secondary">
        More account features
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <SellerSectionCard />
        <OrdersSectionCard />
        <WishlistSectionCard />
        {FUTURE_SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            disabled
            aria-disabled="true"
            title={`${label} — available in a later module`}
            className={TILE_CLASSES_DISABLED}
          >
            <Icon aria-hidden="true" className="h-5 w-5 text-text-muted" />
            <span className="text-sm font-medium text-text-primary">{label}</span>
            <span className="text-xs text-text-muted">Available in a later module</span>
          </button>
        ))}
        <SignOutSectionCard />
      </div>
    </section>
  )
}
