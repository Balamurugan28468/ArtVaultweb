import { Bell, CreditCard, Heart, LogOut, MapPin, Package, Settings, ShieldCheck, Star, Store } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
import { SignOutButton } from '@/features/auth'
import { useSellerStatus } from '@/features/seller-studio'

const TILE_CLASSES =
  'flex flex-col items-start gap-2 rounded-xl border border-border bg-surface p-4 text-left shadow-card transition-colors hover:border-brand-primary'
const TILE_CLASSES_DISABLED =
  'flex cursor-not-allowed flex-col items-start gap-2 rounded-xl border border-border bg-surface p-4 text-left opacity-60 shadow-card'

/**
 * Sourced from the verified Auth custom claim (useAuth().role), never a
 * mirrored field, matching how every privileged/role-gated decision in this app is made.
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

/** Entry point into My Orders. */
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

/** Entry point into the Address Book. */
function AddressesSectionCard() {
  return (
    <Link to="/account/addresses" className={TILE_CLASSES}>
      <MapPin aria-hidden="true" className="h-5 w-5 text-accent-gold" />
      <span className="text-sm font-medium text-text-primary">Addresses</span>
      <span className="text-xs text-text-muted">Manage your saved addresses</span>
    </Link>
  )
}

/** Wishlist entry point. */
function WishlistSectionCard() {
  return (
    <Link to="/wishlist" className={TILE_CLASSES}>
      <Heart aria-hidden="true" className="h-5 w-5 text-brand-primary" />
      <span className="text-sm font-medium text-text-primary">Wishlist</span>
      <span className="text-xs text-text-muted">Artworks you've saved</span>
    </Link>
  )
}

/** Payment Methods entry point. */
function PaymentMethodsSectionCard() {
  return (
    <Link to="/account/payment-methods" className={TILE_CLASSES}>
      <CreditCard aria-hidden="true" className="h-5 w-5 text-accent-gold" />
      <span className="text-sm font-medium text-text-primary">Payment methods</span>
      <span className="text-xs text-text-muted">UPI, Cards, and COD options</span>
    </Link>
  )
}

/** Notifications entry point. */
function NotificationsSectionCard() {
  return (
    <Link to="/account/notifications" className={TILE_CLASSES}>
      <Bell aria-hidden="true" className="h-5 w-5 text-brand-primary" />
      <span className="text-sm font-medium text-text-primary">Notifications</span>
      <span className="text-xs text-text-muted">Order updates & alerts</span>
    </Link>
  )
}

/** Security entry point. */
function SecuritySectionCard() {
  return (
    <Link to="/account/security" className={TILE_CLASSES}>
      <ShieldCheck aria-hidden="true" className="h-5 w-5 text-accent-gold" />
      <span className="text-sm font-medium text-text-primary">Security</span>
      <span className="text-xs text-text-muted">Passwords & credentials</span>
    </Link>
  )
}

/** Reviews entry point. */
function ReviewsSectionCard() {
  return (
    <Link to="/account/reviews" className={TILE_CLASSES}>
      <Star aria-hidden="true" className="h-5 w-5 text-brand-primary" />
      <span className="text-sm font-medium text-text-primary">Reviews</span>
      <span className="text-xs text-text-muted">Your collector feedback</span>
    </Link>
  )
}

/** Settings entry point. */
function SettingsSectionCard() {
  return (
    <Link to="/account/settings" className={TILE_CLASSES}>
      <Settings aria-hidden="true" className="h-5 w-5 text-text-secondary" />
      <span className="text-sm font-medium text-text-primary">Settings</span>
      <span className="text-xs text-text-muted">Profile & preferences</span>
    </Link>
  )
}

/** Sign-out entry point. */
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
        <AddressesSectionCard />
        <PaymentMethodsSectionCard />
        <NotificationsSectionCard />
        <SecuritySectionCard />
        <ReviewsSectionCard />
        <SettingsSectionCard />
        <SignOutSectionCard />
      </div>
    </section>
  )
}
