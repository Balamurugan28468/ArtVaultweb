import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  label: string
  variant?: 'ghost' | 'solid'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, variant = 'ghost', className = '', type = 'button', ...props }, ref) => {
    const variantClasses =
      variant === 'solid'
        ? 'bg-surface-elevated text-text-primary hover:bg-brand-primary hover:text-white'
        : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'

    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors duration-150 ease-standard disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses} ${className}`}
        {...props}
      >
        {icon}
      </button>
    )
  },
)
IconButton.displayName = 'IconButton'
