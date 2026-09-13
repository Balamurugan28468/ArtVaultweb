import { Camera, Grid2x2, Monitor, Palette, Shapes, Sparkles } from 'lucide-react'
import { useState, type ComponentType } from 'react'
import { ARTWORK_CATEGORIES, type ArtworkCategory } from '@/features/artwork'
import { Avatar, Button, Input, SearchInput } from '@/shared/ui'
import type { MarketplaceFilters as Filters } from '../types'

const CATEGORY_LABELS: Record<ArtworkCategory, string> = {
  painting: 'Painting',
  sculpture: 'Sculpture',
  photography: 'Photography',
  digital: 'Digital',
  other: 'Other',
}

// Same icon language as the Explore category strip and the Categories page
// — one visual vocabulary for "category" everywhere it appears.
const CATEGORY_ICON: Record<ArtworkCategory, ComponentType<{ className?: string }>> = {
  painting: Palette,
  sculpture: Shapes,
  photography: Camera,
  digital: Monitor,
  other: Sparkles,
}

const AVAILABILITY_OPTIONS = ['Buy Now', 'On Auction'] as const

function CategoryRow({
  icon: Icon,
  label,
  count,
  selected,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  count?: number
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm transition-colors duration-150 ease-standard ${
        selected ? 'bg-accent-gold/15 font-medium text-accent-gold' : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
      }`}
    >
      <span className="flex items-center gap-2">
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
        {label}
      </span>
      {count != null && <span className="text-xs text-text-muted">{count}</span>}
    </button>
  )
}

export interface MarketplaceFiltersProps {
  filters: Filters
  onChange: (next: Filters) => void
  /** Real, per-category published-artwork counts (see useCategoryArtworkCounts) — omitted entirely while loading rather than showing a fake number. */
  categoryCounts?: Record<ArtworkCategory, number>
  totalCount?: number
  /** A real (if scope-limited) filter over artist names already present in the currently-loaded results — see MarketplaceGrid's own comment on why this isn't a full catalog-wide artist search. */
  artistQuery: string
  onArtistQueryChange: (value: string) => void
  artistOptions: string[]
  onClearAll: () => void
}

/**
 * All Firestore-native (see marketplaceRepository.ts): category is a
 * single-select equality filter over the fixed ARTWORK_CATEGORIES enum
 * (never a free-text field — there is no "browse all categories that
 * exist" query to build here, the set is already closed and known); the
 * price range inputs apply on a deliberate button press rather than per
 * keystroke, so a filter change always means exactly one new query, never
 * one per character typed. Sort moved out of this sidebar into Explore's
 * own results toolbar (UI-01 reference-driven rebuild) — it reorders
 * results rather than narrowing them, so it reads more naturally next to
 * the result count than mixed in among the narrowing filters here.
 *
 * Availability (Buy Now / On Auction) is rendered as an honestly disabled
 * section — no such status exists on an Artwork document today (no cart,
 * no auctions), so checking a box here would either do nothing real or
 * have to be faked. The section says so plainly rather than pretending.
 */
export function MarketplaceFilters({
  filters,
  onChange,
  categoryCounts,
  totalCount,
  artistQuery,
  onArtistQueryChange,
  artistOptions,
  onClearAll,
}: MarketplaceFiltersProps) {
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

  const hasActiveFilters = filters.category !== null || filters.minPrice != null || filters.maxPrice != null || artistQuery.trim() !== ''

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">Filters</p>
        {hasActiveFilters && (
          <button type="button" onClick={onClearAll} className="text-xs font-medium text-brand-primary-on-dark hover:underline">
            Clear all
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <p className="px-0.5 pb-1 text-xs font-semibold tracking-[0.1em] text-text-muted uppercase">Category</p>
        <CategoryRow icon={Grid2x2} label="All" count={totalCount} selected={filters.category === null} onClick={() => onChange({ ...filters, category: null })} />
        {ARTWORK_CATEGORIES.map((category) => (
          <CategoryRow
            key={category}
            icon={CATEGORY_ICON[category]}
            label={CATEGORY_LABELS[category]}
            count={categoryCounts?.[category]}
            selected={filters.category === category}
            onClick={() => onChange({ ...filters, category })}
          />
        ))}
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
          <div className="w-24">
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
          <div className="w-24">
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
        </div>
        <div className="flex items-center gap-2">
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
        {(filters.minPrice != null || filters.maxPrice != null) && filters.sort === 'newest' && (
          <p className="text-xs text-text-muted">A price range is active, so results are sorted by price (low to high).</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold tracking-[0.1em] text-text-muted uppercase">Availability</p>
          <span className="text-[10px] font-medium text-text-muted">Coming soon</span>
        </div>
        <label className="flex cursor-not-allowed items-center gap-2 text-sm text-text-secondary opacity-70">
          <input type="checkbox" checked disabled className="h-4 w-4 rounded border-border-strong" />
          All
        </label>
        {AVAILABILITY_OPTIONS.map((label) => (
          <label
            key={label}
            title={`${label} isn't available yet`}
            className="flex cursor-not-allowed items-center gap-2 text-sm text-text-muted opacity-60"
          >
            <input type="checkbox" disabled className="h-4 w-4 rounded border-border-strong" />
            {label}
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-[0.1em] text-text-muted uppercase">Artist</p>
        <SearchInput
          aria-label="Search artists"
          placeholder="Search artists…"
          value={artistQuery}
          onChange={(event) => onArtistQueryChange(event.target.value)}
        />
        {/* Real names only, scoped to artists already present in the
            currently-loaded results — see MarketplaceGrid. There is no
            catalog-wide "list every artist" query here, so this never
            claims to cover artists whose work simply hasn't loaded yet. */}
        {artistOptions.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {artistOptions.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onArtistQueryChange(name)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-secondary transition-colors duration-150 ease-standard hover:bg-surface-elevated hover:text-text-primary"
              >
                <Avatar name={name} size="sm" />
                <span className="truncate">{name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
