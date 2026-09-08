import { Suspense, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { AIAssistantLauncher } from '@/features/ai'
import { Spinner, Toaster } from '@/shared/ui'
import { AppBottomNav } from './AppBottomNav'
import { AppSidebar } from './AppSidebar'
import { AppTopBar } from './AppTopBar'
import { NavDrawer } from './NavDrawer'

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  useEffect(() => {
    // React Router does not reset scroll position for a custom scroll
    // container on client-side navigation (its built-in scroll
    // restoration only covers the window/document, which isn't the
    // active scrolling element here at mobile widths). Without this, a
    // leftover scroll position from a taller previous route renders the
    // next route's top content shifted upward, behind the fixed header.
    // Scoped to actual path changes only (not every render, not query
    // updates on the same page), and only resets this one container plus
    // the window — it deliberately doesn't touch any other future nested
    // scroll region (e.g. a modal's own scroll).
    if (mainRef.current) mainRef.current.scrollTop = 0
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    // Below `lg`, the shell is pinned to exactly the viewport height and only
    // <main> scrolls internally — this is what guarantees the fixed-feeling
    // bottom nav can never have page content land underneath it, regardless
    // of how tall a given page's content is. (Padding alone can't guarantee
    // that: it only affects reachability via scroll, not where content
    // naturally renders before the user scrolls.) At `lg`+ there's no bottom
    // nav to protect against, so the page reverts to plain, unbounded
    // whole-page scroll — the original, approved desktop behavior.
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-text-primary lg:h-auto lg:min-h-screen lg:overflow-visible">
      <AppTopBar onOpenDrawer={() => setDrawerOpen(true)} />
      <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="mx-auto flex w-full max-w-[var(--max-width-shell)] flex-1 overflow-hidden lg:flex-none lg:overflow-visible">
        <AppSidebar />
        <main
          ref={mainRef}
          className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:overflow-visible lg:px-8"
        >
          <Suspense fallback={<div className="flex justify-center py-16"><Spinner label="Loading page" /></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <AppBottomNav />
      <AIAssistantLauncher />
      <Toaster />
    </div>
  )
}
