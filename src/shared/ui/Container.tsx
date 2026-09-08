import type { ReactNode } from 'react'

/**
 * The one reading-column-width authority pages opt into (Module 10) —
 * distinct from AppShell's own `--max-width-shell`, which bounds the whole
 * sidebar+content row. No horizontal padding here: `AppShell`'s `<main>`
 * already supplies that gutter for every page, used or not, so adding it
 * again here would double it up for the pages that do use `Container`.
 */
export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl ${className}`}>{children}</div>
}
