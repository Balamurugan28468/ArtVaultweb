import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
}: {
  title?: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-6 py-12 text-center"
    >
      <AlertTriangle aria-hidden="true" className="h-6 w-6 text-danger" />
      <p className="text-base font-medium text-text-primary">{title}</p>
      {description && <p className="max-w-sm text-sm text-text-secondary">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
