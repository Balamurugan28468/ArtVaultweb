import { useState } from 'react'
import { ARTWORK_CATEGORIES, type ArtworkCategory } from '@/features/artwork'
import { Button, Chip, Input } from '@/shared/ui'
import { MARKETPLACE_SORTS, type MarketplaceFilters as Filters, type MarketplaceSort } from '../types'

const SORT_LABELS: Record<MarketplaceSort, string> = {
  newest: 'Newest',
  'price-asc': 'Price: Low to High',
  'price-desc': 'Price: High to Low',
}

const CATEGORY_LABELS: Record<ArtworkCategory, string> = {
  painting: 'Painting',
  sculpture: 'Sculpture',
  photography: 'Photography',
  digital: 'Digital',
  other: 'Other',
}

/**
 * All Firestore-native (see marketplaceRepository.ts): category is a
 * single-select equality filter over the fixed ARTWORK_CATEGORIES enum
 * (never a free-text field — there is no "browse all categories that
 * exist" query to build here, the set is already closed and known), sort
 * picks one of the three orderings the composite indexes in
 * firestore.indexes.json actually cover, and the price range inputs apply
 * on a deliberate button press rather than per keystroke, so a filter
 * change always means exactly one new query, never one per character
 * typed.
 */
export function MarketplaceFilters({ filters, onChange }: { filters: Filters; onChange: (next: Filters) => void }) {
  const [minDraft, setMinDraft] = useState(filters.minPrice != null ? String(filters.minPrice / 100) : '')
  const [maxDraft, setMaxDraft] = useState(filters.maxPrice != null ? String(filters.maxPrice / 100) : '')

  function applyPriceRange() {
    const min = minDraft.trim() === '' ? null : Math.round(Number(minDraft) * 100)
    const max = maxDraft.trim() === '' ? null : Math.round(Number(maxDraft) * 100)
    onChange({
      ...filters,
      minPrice: min != null && Number.isFinite(min) && min >= 0 ? min : null,
      maxPrice: max != null && Number.isFinite(max) && max >= 0 ? max : null,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-[0.1em] text-text-muted uppercase">Category</p>
        <div className="flex flex-wrap gap-2">
          <Chip label="All" selected={filters.category === null} onClick={() => onChange({ ...filters, category: null })} />
          {ARTWORK_CATEGORIES.map((category) => (
            <Chip
              key={category}
              label={CATEGORY_LABELS[category]}
              selected={filters.category === category}
              onClick={() => onChange({ ...filters, category })}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-[0.1em] text-text-muted uppercase">Sort by</p>
        <div className="flex flex-wrap gap-2">
          {MARKETPLACE_SORTS.map((sort) => (
            <Chip key={sort} label={SORT_LABELS[sort]} selected={filters.sort === sort} onClick={() => onChange({ ...filters, sort })} />
          ))}
        </div>
        {(filters.minPrice != null || filters.maxPrice != null) && filters.sort === 'newest' && (
          <p className="text-xs text-text-muted">A price range is active, so results are sorted by price (low to high).</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-[0.1em] text-text-muted uppercase">Price range (₹)</p>
        <div className="flex flex-wrap items-center gap-2">
          {/* Input's own base class already includes w-full — wrapping it
              in a fixed-width div (rather than passing a narrower w-28
              via className on the input itself) sidesteps a same-specificity
              CSS conflict where Tailwind's generated stylesheet order, not
              this component's className order, decides which "w-*" utility
              actually wins. Found during Module 09's design-quality audit:
              both fields rendered full-width in the real browser. */}
          <div className="w-28">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              aria-label="Minimum price"
              placeholder="Min"
              value={minDraft}
              onChange={(event) => setMinDraft(event.target.value)}
            />
          </div>
          <span className="text-text-muted">–</span>
          <div className="w-28">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              aria-label="Maximum price"
              placeholder="Max"
              value={maxDraft}
              onChange={(event) => setMaxDraft(event.target.value)}
            />
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={applyPriceRange}>
            Apply
          </Button>
          {(filters.minPrice != null || filters.maxPrice != null) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setMinDraft('')
                setMaxDraft('')
                onChange({ ...filters, minPrice: null, maxPrice: null })
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
