import type { ReactNode } from 'react'

/**
 * The one reading-column-width authority pages opt into (Module 10) —
 * distinct from AppShell's own `--max-width-shell`, which bounds the whole
 * sidebar+content row. No horizontal padding here: `AppShell`'s `<main>`
 * already supplies that gutter for every page, used or not, so adding it
 * again here would double it up for the pages that do use `Container`.
 *
 * `size="wide"` (UI-01 visual refinement) opts a page into the same maximum
 * width as the shell itself, rather than the narrower reading-column
 * default — for pages whose real content is a dense artwork grid (Explore,
 * Home, Categories, Wishlist, Artist/Artwork pages), the narrower default
 * was leaving real, usable desktop width empty instead of showing more real
 * artwork. Text-heavy pages (forms, account, admin) keep the narrower
 * default, where a full-width reading column would hurt readability.
 */
export function Container({
  children,
  className = '',
  size = 'default',
}: {
  children: ReactNode
  className?: string
  size?: 'default' | 'wide'
}) {
  const maxWidthClass = size === 'wide' ? 'max-w-[90rem]' : 'max-w-6xl'
  return <div className={`mx-auto w-full ${maxWidthClass} ${className}`}>{children}</div>
}
