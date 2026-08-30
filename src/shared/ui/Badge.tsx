import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'gold' | 'success' | 'danger'

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-elevated text-text-secondary',
  gold: 'bg-accent-gold/15 text-accent-gold',
  success: 'bg-success/15 text-success',
  danger: 'bg-danger/15 text-danger',
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  )
}
