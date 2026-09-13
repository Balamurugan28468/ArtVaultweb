import { LayoutGrid, List, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { PublicArtworkCard, toArtworkError } from '@/features/artwork'
import { Button, EmptyState, ErrorState, ResponsiveGrid, Skeleton } from '@/shared/ui'
import { useArtistDisplayNames } from '../hooks/useArtistDisplayNames'
import { useMarketplaceArtworks } from '../hooks/useMarketplaceArtworks'
import { MARKETPLACE_SORTS, type MarketplaceFilters, type MarketplaceSort } from '../types'

const SORT_LABELS: Record<MarketplaceSort, string> = {
  newest: 'Newest',
  'price-asc': 'Price: Low to High',
  'price-desc': 'Price: High to Low',
}

/**
 * The Marketplace results surface: a cross-seller grid of PUBLISHED
 * artworks (see useMarketplaceArtworks/marketplaceRepository.ts).
 * Deliberately built from the same PublicArtworkCard Module 07 already
 * established for a single artist's catalog, rather than a parallel
 * component — the only addition here is resolving the artist's display
 * name (see useArtistDisplayNames) to pass through, never any owner-only
 * control, matching PublicArtworkCard's own read-only contract.
 * PublicArtworkCard owns its own navigation (image/title -> the artwork's
 * own page, artist name -> the artist's page — Module 11) — this grid no
 * longer wraps each card in its own Link.
 *
 * `searchQuery`/`artistQuery` (UI-01) are plain, honestly-scoped client-side
 * filters over whatever page(s) `useMarketplaceArtworks` has already
 * fetched — never a full-text search across the whole catalog (Firestore
 * has no such index here; see docs/ARCHITECTURE.md), and never a
 * catalog-wide artist directory (there's no such query either — the
 * sidebar's artist list is drawn from these same already-loaded results).
 * "Load more"/the end-of-results message are still driven by the
 * *unfiltered* query state, so a search that matches nothing on the
 * current page still lets the seller load more pages to search further,
 * rather than looking like a dead end.
 *
 * The results toolbar (real count, sort, grid/list) lives here rather than
 * in MarketplacePage because this component is the one thing that actually
 * knows the true, currently-filtered result set and its pagination state —
 * putting the count anywhere else would mean either duplicating this same
 * filtering logic or reporting a number that doesn't match what's on
 * screen. List view is a genuinely disabled placeholder (this project has
 * no list-row layout for artworks) rather than a second, unfinished grid.
 */
export function MarketplaceGrid({
  filters,
  onFiltersChange,
  searchQuery = '',
  artistQuery = '',
  onOpenFilters,
}: {
  filters: MarketplaceFilters
  onFiltersChange: (next: MarketplaceFilters) => void
  searchQuery?: string
  artistQuery?: string
  /** UI-01 mobile correction: renders a "Filters" button in this toolbar,
   *  right next to Sort, on mobile/tablet only (the desktop sidebar/drawer
   *  trigger lives in MarketplacePage instead). Omitted entirely when not
   *  supplied, rather than every other caller needing a no-op. */
  onOpenFilters?: () => void
}) {
  const query = useMarketplaceArtworks(filters)
  const allArtworks = query.data?.pages.flatMap((page) => page.artworks) ?? []
  const artistNames = useArtistDisplayNames(allArtworks.map((artwork) => artwork.sellerId))

  const trimmedTitleQuery = searchQuery.trim().toLowerCase()
  const trimmedArtistQuery = artistQuery.trim().toLowerCase()
  const artworks = allArtworks.filter((artwork) => {
    const matchesTitle = !trimmedTitleQuery || artwork.title.toLowerCase().includes(trimmedTitleQuery)
    const artistName = artistNames[artwork.sellerId]
    const matchesArtist = !trimmedArtistQuery || (artistName?.toLowerCase().includes(trimmedArtistQuery) ?? false)
    return matchesTitle && matchesArtist
  })

  const [view, setView] = useState<'grid' | 'list'>('grid')
  const isFiltered = Boolean(trimmedTitleQuery || trimmedArtistQuery)

  if (query.status === 'pending') {
    return (
      <div aria-busy="true" aria-label="Loading marketplace artworks">
        <ResponsiveGrid>
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="aspect-square w-full" />
        </ResponsiveGrid>
      </div>
    )
  }

  if (query.status === 'error') {
    const error = toArtworkError(query.error)
    return (
      <ErrorState
        title="Couldn't load the marketplace"
        description={error.message}
        action={
          <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
            Try again
          </Button>
        }
      />
    )
  }

  if (allArtworks.length === 0) {
    return (
      <EmptyState
        title="No artworks match these filters"
        description="Try a different category, price range, or clear your filters to see everything published so far."
      />
    )
  }

  // Honest result count: an exact number once every matching artwork is
  // loaded (no more pages), otherwise "N+" — never a precise-looking total
  // that's actually just "how many happen to be loaded so far".
  const countLabel = isFiltered
    ? `${artworks.length} of ${allArtworks.length}${query.hasNextPage ? '+' : ''} artworks`
    : `${allArtworks.length}${query.hasNextPage ? '+' : ''} artwork${allArtworks.length === 1 && !query.hasNextPage ? '' : 's'}`

  return (
    <div className="flex flex-col gap-4">
      {/* UI-01 mobile density correction: this row's controls (Filters,
          "Sort by" + select, Grid/List) previously had no wrap and no width
          limit of their own — on a narrow phone their combined width could
          exceed the available space with nothing to stop it overflowing,
          even though the row's own gap wraps *between* the count and this
          whole group. `flex-wrap` here + a capped select width + hiding the
          "Sort by" label text (kept for screen readers via aria-label)
          keeps every real control reachable without horizontal scroll. */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <p className="text-sm text-text-secondary">{countLabel}</p>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenFilters && (
            <Button type="button" variant="secondary" size="sm" onClick={onOpenFilters} className="lg:hidden">
              <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
              Filters
            </Button>
          )}
          <label className="flex items-center gap-1.5 text-sm text-text-secondary sm:gap-2">
            <span className="hidden sm:inline">Sort by</span>
            <select
              aria-label="Sort by"
              value={filters.sort}
              onChange={(event) => onFiltersChange({ ...filters, sort: event.target.value as MarketplaceSort })}
              className="h-9 max-w-[8.5rem] rounded-md border border-border-strong bg-surface-elevated px-2 text-sm text-text-primary focus-visible:border-brand-primary sm:max-w-none"
            >
              {MARKETPLACE_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {SORT_LABELS[sort]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1 rounded-md border border-border-strong p-0.5">
            <button
              type="button"
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
              className={`flex h-8 w-8 items-center justify-center rounded ${view === 'grid' ? 'bg-accent-gold text-text-on-light' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <LayoutGrid aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only">Grid view</span>
            </button>
            <span
              role="button"
              aria-disabled="true"
              title="List view — coming soon"
              className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded text-text-muted opacity-60"
            >
              <List aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only">List view — coming soon</span>
            </span>
          </div>
        </div>
      </div>

      {artworks.length > 0 ? (
        <ResponsiveGrid>
          {artworks.map((artwork) => (
            <PublicArtworkCard key={artwork.id} artwork={artwork} artistDisplayName={artistNames[artwork.sellerId]} />
          ))}
        </ResponsiveGrid>
      ) : (
        <EmptyState
          title={
            trimmedTitleQuery && trimmedArtistQuery
              ? `No loaded artworks match "${searchQuery.trim()}" by "${artistQuery.trim()}"`
              : trimmedArtistQuery
                ? `No loaded artworks match artist "${artistQuery.trim()}"`
                : `No loaded artworks match "${searchQuery.trim()}"`
          }
          description="Search only looks at artworks already loaded on this page — load more results below, or clear your search."
        />
      )}

      {query.hasNextPage ? (
        // Module 10 Phase 2: left-aligned, not centered in the outer flex
        // column — the grid track (see ResponsiveGrid) only ever spans as
        // many columns as there are results, so centering this against the
        // *container's* full width drifted it away from a sparse result
        // set's actual cards instead of sitting naturally below them.
        <div className="flex justify-start">
          <Button variant="secondary" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Loading more…' : 'Load more'}
          </Button>
        </div>
      ) : (
        <p className="text-left text-sm text-text-muted">You've reached the end of the marketplace.</p>
      )}
    </div>
  )
}
