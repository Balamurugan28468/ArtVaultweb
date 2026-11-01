import { Star } from 'lucide-react'
import { useState } from 'react'

interface StarRatingProps {
  value: number
  onChange?: (value: number) => void
  readOnly?: boolean
  size?: 'sm' | 'md' | 'lg'
  showCount?: boolean
  count?: number
  className?: string
}

const SIZES = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4 sm:h-5 sm:w-5',
  lg: 'h-6 w-6',
}

export function StarRating({
  value,
  onChange,
  readOnly = false,
  size = 'md',
  showCount = false,
  count,
  className = '',
}: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null)
  const activeRating = hoverValue !== null ? hoverValue : value
  const iconSize = SIZES[size]

  return (
    <div className={`inline-flex items-center gap-1 ${className}`} aria-label={`Rating: ${value} out of 5 stars`}>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= activeRating
          return readOnly ? (
            <Star
              key={star}
              aria-hidden="true"
              className={`${iconSize} ${
                filled ? 'fill-accent-gold text-accent-gold' : 'fill-transparent text-text-muted/40'
              }`}
            />
          ) : (
            <button
              key={star}
              type="button"
              onClick={() => onChange?.(star)}
              onMouseEnter={() => setHoverValue(star)}
              onMouseLeave={() => setHoverValue(null)}
              className="rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-gold"
              aria-label={`${star} star${star === 1 ? '' : 's'}`}
            >
              <Star
                aria-hidden="true"
                className={`${iconSize} transition-colors ${
                  filled ? 'fill-accent-gold text-accent-gold' : 'fill-transparent text-text-muted hover:text-accent-gold'
                }`}
              />
            </button>
          )
        })}
      </div>
      {showCount && count !== undefined && (
        <span className="ml-1 text-xs text-text-muted">({count})</span>
      )}
    </div>
  )
}

