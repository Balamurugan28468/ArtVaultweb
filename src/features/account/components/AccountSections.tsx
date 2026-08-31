import { Bell, CreditCard, Heart, MapPin, Package, Settings, ShieldCheck, Star, Store } from 'lucide-react'
import type { ComponentType } from 'react'

interface FutureSection {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
}

// Reserves the account information architecture for later modules without
// any fake/dead functionality — each renders as a genuinely disabled native
// <button>, not a clickable "coming soon" affordance (see
// ARTVAULT_PROJECT_STATE.md → Module 02 planning decisions, applied here).
const FUTURE_SECTIONS: FutureSection[] = [
  { id: 'addresses', label: 'Addresses', icon: MapPin },
  { id: 'orders', label: 'Orders', icon: Package },
  { id: 'wishlist', label: 'Wishlist', icon: Heart },
  { id: 'payment-methods', label: 'Payment methods', icon: CreditCard },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'seller', label: 'Become a seller', icon: Store },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function AccountSections() {
  return (
    <section aria-labelledby="account-sections-heading" className="flex flex-col gap-3">
      <h2 id="account-sections-heading" className="text-sm font-medium text-text-secondary">
        More account features
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
