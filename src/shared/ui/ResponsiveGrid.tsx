import type { ReactNode } from 'react'

/**
 * Module 10: below `sm`, an explicit single full-width column — unchanged
 * from before, and deliberately not handed to the auto-fill logic below,
 * which would otherwise compute a column width that doesn't reach the
 * screen edges on a narrow phone. At `sm` and up, column COUNT is derived
 * from the container's real available width (`repeat(auto-fill,
 * minmax(15rem, 1fr))`) rather than jumping between fixed breakpoint
 * counts (previously 2/3/4 at sm/lg/xl regardless of the container's
 * actual width) — this is what makes a 768px tablet container render a
 * genuine 2-3 column layout instead of inheriting whatever the nearest
 * hardcoded breakpoint said, and what makes a sparse result set (as few as
 * one item) render as a normally-sized card that simply doesn't stretch to
 * fill the row, rather than either a forced 4-column grid with 3 empty
 * cells or one card awkwardly stretched to the full container width.
 */
export function ResponsiveGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] sm:gap-5 lg:gap-6 ${className}`}
    >
      {children}
    </div>
  )
}
