import { forwardRef, type ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'gold' | 'info'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Measured WCAG AA fix (Module 10 Phase 2): white text on the base
  // --color-brand-primary only reached 4.23:1 (fails the 4.5:1 minimum).
  // Rather than introduce a new color, the resting state reuses the
  // already-existing --color-brand-primary-hover (5.70:1, passes) and
  // hover/active shift one step darker to --color-brand-primary-active.
  primary:
    'bg-brand-primary-hover text-white hover:bg-brand-primary-active active:bg-brand-primary-active disabled:hover:bg-brand-primary-hover',
  secondary:
    'bg-surface-elevated text-text-primary border border-border-strong hover:border-brand-primary disabled:hover:border-border-strong',
  ghost: 'bg-transparent text-text-primary hover:bg-surface-elevated',
  gold: 'bg-accent-gold text-text-on-light hover:bg-accent-gold-hover disabled:hover:bg-accent-gold',
  // UI-01's AR+AI color convention: purple (the existing `primary`) reads as
  // "AI," so AR gets its own accent — Tailwind's stock blue-600/700 rather
  // than the app's own --color-info (#3b82f6), which is a touch too light
  // for white text at 4.5:1 (the same class of issue `primary` above
  // already had to work around).
  info: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-700 disabled:hover:bg-blue-600',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
}

/**
 * Shared class-name builder so non-<button> elements (e.g. a react-router
 * Link styled to look like a button) can match Button's exact appearance
 * without an asChild/Slot polymorphism layer.
 */
export function buttonClassName(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className = ''): string {
  return `inline-flex items-center justify-center rounded-md font-medium transition-colors duration-150 ease-standard disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', type = 'button', ...props }, ref) => {
    return <button ref={ref} type={type} className={buttonClassName(variant, size, className)} {...props} />
  },
)
Button.displayName = 'Button'
