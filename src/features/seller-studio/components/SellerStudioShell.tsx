import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { PageHeader } from '@/shared/ui'

interface SellerStudioTab {
  label: string
  href: string
}

// UI-03 — a real, shared sub-navigation for every Seller Studio screen.
// Deliberately a small, fixed, hardcoded list (not sourced from NAV_ITEMS)
// — these four destinations are specific to being *inside* Seller Studio,
// not general app navigation, and NAV_ITEMS' own single "Seller Studio"
// entry already covers getting here from the rest of the app (top bar,
// bottom-nav More, hamburger drawer — all unchanged by this). `/seller-
// studio/artworks/new` is matched by prefix (startsWith), not exact
// equality, so the Edit Artwork route (`/seller-studio/artworks/:id/edit`)
// never falsely highlights "Create Artwork" as active.
const TABS: SellerStudioTab[] = [
  { label: 'Dashboard', href: '/seller-studio' },
  { label: 'My Artworks', href: '/seller-studio/artworks' },
  { label: 'Create Artwork', href: '/seller-studio/artworks/new' },
  { label: 'Public Profile', href: '/seller-studio/profile' },
]

function isTabActive(pathname: string, href: string): boolean {
  if (href === '/seller-studio') return pathname === '/seller-studio'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Shared page wrapper for every Seller Studio screen — the heading area
 * plus this real sub-nav row, horizontally scrollable rather than wrapping
 * (same mobile-overflow-safety pattern as ArtworkDetailPage's own
 * information tabs and My Orders' filter chips), so it stays usable at the
 * narrowest tested widths without clipping or pushing content around.
 */
export function SellerStudioShell({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  const { pathname } = useLocation()

  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={title} description={description} actions={actions} />

      <nav aria-label="Seller Studio" className="-mx-3 flex gap-1 overflow-x-auto border-b border-border px-3 xs:mx-0 xs:px-0">
        {TABS.map((tab) => {
          const active = isTabActive(pathname, tab.href)
          return (
            <Link
              key={tab.href}
              to={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-150 ease-standard ${
                active
                  ? 'border-accent-gold text-text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>

      {children}
    </section>
  )
}
