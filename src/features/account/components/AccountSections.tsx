import { Bell, CreditCard, Heart, MapPin, Package, Settings, ShieldCheck, Star, Store } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link } from 'react-router'
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
// 'seller' is deliberately absent from this list as of Module 04 — it now
// renders as SellerSectionCard, a real, functional entry point, below.
const FUTURE_SECTIONS: FutureSection[] = [
  { id: 'addresses', label: 'Addresses', icon: MapPin },
  { id: 'orders', label: 'Orders', icon: Package },
  { id: 'wishlist', label: 'Wishlist', icon: Heart },
  { id: 'payment-methods', label: 'Payment methods', icon: CreditCard },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'settings', label: 'Settings', icon: Settings },
]

/**
 * The one genuinely functional entry in this grid — everything else stays a
 * disabled placeholder. Label/destination/subtext all reflect the real
 * seller-application state (never-applied / pending / approved), so this
 * never implies more access than the viewer actually has.
 */
function SellerSectionCard() {
  const state = useSellerStatus()

  if (state.status === 'loading' || state.status === 'error') {
    return (
      <div
        aria-hidden="true"
        className="flex flex-col items-start gap-2 rounded-xl border border-border bg-surface p-4 text-left opacity-60 shadow-card"
      >
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
        : { href: '/seller/apply', subtext: 'Start selling on ArtVault' }
  const label = state.status === 'approved' ? 'Seller Studio' : 'Become a seller'

  return (
    <Link
      to={href}
      className="flex flex-col items-start gap-2 rounded-xl border border-border bg-surface p-4 text-left shadow-card transition-colors hover:border-brand-primary"
    >
      <Store aria-hidden="true" className="h-5 w-5 text-brand-primary" />
      <span className="text-sm font-medium text-text-primary">{label}</span>
      <span className="text-xs text-text-muted">{subtext}</span>
    </Link>
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
        {FUTURE_SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            disabled
            aria-disabled="true"
            title={`${label} — available in a later module`}
            className="flex cursor-not-allowed flex-col items-start gap-2 rounded-xl border border-border bg-surface p-4 text-left opacity-60 shadow-card"
          >
            <Icon aria-hidden="true" className="h-5 w-5 text-text-muted" />
            <span className="text-sm font-medium text-text-primary">{label}</span>
            <span className="text-xs text-text-muted">Available in a later module</span>
          </button>
        ))}
      </div>
    </section>
  )
}
