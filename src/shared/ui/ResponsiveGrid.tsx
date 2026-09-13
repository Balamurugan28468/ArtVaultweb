import type { ReactNode } from 'react'

/**
 * UI-01 responsive density correction, attempt 4 — an owner-specified exact
 * column count per breakpoint, not a formula:
 * <340px: 1, 340-767px: 2, 768-1279px: 3, 1280-1535px: 4, >=1536px: 5.
 * (Attempt 3 used a 360px threshold; a 350px phone — an explicit owner test
 * width — still fell below that and rendered one giant full-width column.
 * The threshold itself was the bug this time, not the mechanism.)
 *
 * Attempt 1 used `repeat(auto-fill, minmax(X, 1fr))`. The `1fr` was the bug
 * the owner's manual review caught: `auto-fill` picks however many tracks
 * fit the container at the *minimum* size, independent of item count, and
 * `1fr` then stretches every one of those tracks to consume all remaining
 * space — with only 1-3 real published artworks, a wide container often
 * computed just 1-2 tracks, each stretching to roughly half the viewport.
 *
 * Attempt 2 (fixed `grid-cols-N` per named Tailwind breakpoint, plus one
 * extra *ad-hoc* `[@media(min-width:360px)]` breakpoint for a "2 columns on
 * larger phones" step) reintroduced the same symptom through a different
 * mechanism: an arbitrary inline media query has no guaranteed cascade
 * position relative to Tailwind's own registered breakpoints, so it could
 * compile after `xl:`/`2xl:` and win at every width ≥360px regardless of
 * which named breakpoint should apply — confirmed by a real browser test
 * showing giant cards at 1366px, unaffected by `xl:grid-cols-4`. That
 * attempt then moved to a *bounded, non-breakpoint* `repeat(auto-fill,
 * minmax(220px, 260px))` track size instead, which fixed the stretching bug
 * but couldn't express the owner's later, more specific per-breakpoint
 * column counts (e.g. exactly 2 at 360-767px, not "however many 220-260px
 * tracks fit").
 *
 * This version returns to fixed `grid-cols-N` classes, but fixes attempt
 * 2's actual root cause instead of working around it: `xs` (340px) is now a
 * real, registered Tailwind breakpoint (`--breakpoint-xs` in index.css's
 * `@theme`), not an ad-hoc arbitrary variant, so it gets the same
 * guaranteed mobile-first cascade ordering as `sm`/`md`/`lg`/`xl`/`2xl` —
 * structurally immune to the exact bug that broke attempt 2. Fixed
 * `grid-cols-N` never has attempt 1's stretching problem either: `repeat(N,
 * minmax(0, 1fr))` defines N *equal* tracks regardless of how many items
 * exist, so 2 real artworks in a 4-column row occupy exactly 2 of 4 equal
 * tracks — each item's width is fixed by the column definition, never
 * inflated by empty neighboring tracks.
 */
export function ResponsiveGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-1 gap-3 xs:grid-cols-2 xs:gap-4 md:grid-cols-3 xl:grid-cols-4 xl:gap-6 2xl:grid-cols-5 ${className}`}>
      {children}
    </div>
  )
}
