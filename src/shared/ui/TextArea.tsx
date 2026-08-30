import { forwardRef, type TextareaHTMLAttributes } from 'react'

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`min-h-24 w-full rounded-md border border-border-on-light bg-surface-light px-3 py-2 text-sm text-text-on-light placeholder:text-text-muted focus-visible:border-brand-primary aria-invalid:border-danger ${className}`}
        {...props}
      />
    )
  },
)
TextArea.displayName = 'TextArea'
