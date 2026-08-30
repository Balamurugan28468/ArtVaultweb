import type { ReactNode } from 'react'

export function SectionHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      {actions}
    </div>
  )
}
