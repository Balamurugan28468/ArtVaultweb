import type { ReactNode } from 'react'
import { PageHeader } from '@/shared/ui'

/**
 * Thin, shared page wrapper for every Seller Studio screen — currently just
 * the heading area; grows into real cross-page navigation (a sidebar/tabs)
 * once Seller Studio has more than "My Artworks" to switch between.
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
  return (
    <section className="flex flex-col gap-6">
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </section>
  )
}
