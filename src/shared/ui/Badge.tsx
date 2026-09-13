import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'gold' | 'success' | 'danger'

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-elevated text-text-secondary',
  gold: 'bg-accent-gold/15 text-accent-gold',
  success: 'bg-success/15 text-success',
  danger: 'bg-danger/15 text-danger',
}

export type BadgeSize = 'sm' | 'md'

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-xs',
}

export function Badge({
  children,
  tone = 'neutral',
  size = 'md',
}: {
  children: ReactNode
  tone?: BadgeTone
  /** UI-01 mobile density pass: `sm` for tight spaces (e.g. a narrow mobile
   *  card header) where the default `md` pill reads as oversized relative
   *  to its surroundings. Additive — every existing caller keeps `md`. */
  size?: BadgeSize
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-medium ${TONE_CLASSES[tone]} ${SIZE_CLASSES[size]}`}
    >
      {children}
    </span>
  )
}
