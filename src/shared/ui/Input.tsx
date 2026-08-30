import { forwardRef, type InputHTMLAttributes } from 'react'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`h-11 w-full rounded-md border border-border-on-light bg-surface-light px-3 text-sm text-text-on-light placeholder:text-text-muted focus-visible:border-brand-primary aria-invalid:border-danger ${className}`}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'
