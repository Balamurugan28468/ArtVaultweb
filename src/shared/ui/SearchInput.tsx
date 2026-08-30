import { Search } from 'lucide-react'
import { forwardRef, type InputHTMLAttributes } from 'react'

export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => {
    return (
      <div className={`relative ${className}`}>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted"
        />
        <input
          ref={ref}
          type="search"
          className="h-11 w-full rounded-md border border-border-on-light bg-surface-light py-2 pr-3 pl-9 text-sm text-text-on-light placeholder:text-text-muted focus-visible:border-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
          {...props}
        />
      </div>
    )
  },
)
SearchInput.displayName = 'SearchInput'
