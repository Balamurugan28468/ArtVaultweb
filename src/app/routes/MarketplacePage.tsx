import { ArrowRight, Camera, Grid2x2, Monitor, Palette, Search, Shapes, Sparkles } from 'lucide-react'
import { useEffect, useState, type ComponentType, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { isArtworkCategory, type ArtworkCategory } from '@/features/artwork'
import {
  DEFAULT_MARKETPLACE_FILTERS,
  MarketplaceFilters,
  MarketplaceGrid,
  useArtistDisplayNames,
  useCategoryArtworkCounts,
  useMarketplaceArtworks,
  type MarketplaceFiltersState,
} from '@/features/marketplace'
import { Button, Card, Container, Drawer } from '@/shared/ui'

const CATEGORY_LABELS: Record<ArtworkCategory, string> = {
  painting: 'Painting',
  sculpture: 'Sculpture',
  photography: 'Photography',
  digital: 'Digital',
  other: 'Other',
}

const CATEGORY_ICON: Record<ArtworkCategory, ComponentType<{ className?: string }>> = {
  painting: Palette,
  sculpture: Shapes,
  photography: Camera,
  digital: Monitor,
  other: Sparkles,
}

const CATEGORY_STRIP_ITEMS: (ArtworkCategory | null)[] = [null, 'painting', 'sculpture', 'photography', 'digital', 'other']

/**
 * ArtVault's first cross-seller public discovery surface (Module 08) — the
 * sequel to Module 06/07's single-artist public page. Deliberately not
 * nested inside RequireAuth (see router.tsx): works whether or not anyone
 * is signed in, matching every other public route so far. Filter state
 * lives here, not in a global store — it's read by exactly one component
 * tree (this page) and never needs to survive navigating away, so a
 * Zustand store would be pure ceremony for state that already has a
 * natural, single owner.
 *
 * UI-01 reference-driven rebuild: this page now owns three additional
 * pieces of state — a hero search (`searchQuery`, the same title filter
 * MarketplaceGrid already applies), an `artistQuery`, and the sidebar/
 * mobile-drawer composition around a much richer MarketplaceFilters. All of
 * it still drives the exact same `filters`/searchQuery/artistQuery props
 * MarketplaceGrid already knew how to consume — this is a presentation
 * rebuild around unchanged query/pagination/filter logic, not a new data
 * layer. `category`/`q` still mirror into the URL so the Categories page
 * and a shared/bookmarked link land on the right view.
 */
export function MarketplacePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<MarketplaceFiltersState>(() => {
    const category = searchParams.get('category')
    return { ...DEFAULT_MARKETPLACE_FILTERS, category: isArtworkCategory(category) ? category : null }
  })
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '')
  const [artistQuery, setArtistQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    const next = new URLSearchParams()
    if (filters.category) next.set('category', filters.category)
    if (searchQuery.trim()) next.set('q', searchQuery.trim())
    // A real, reproducible bug this exact guard fixes: without it, this
    // effect calls setSearchParams unconditionally on first mount — even
    // when the resulting query string is identical to what's already in
    // the URL (the common case: arriving at /explore with no params at
    // all). That redundant replace-navigate raced a still-settling
    // programmatic `router.navigate('/explore')` in a real test (never
    // observed via an ordinary <Link> click, which is already fully
    // committed before this component mounts) and could win the race,
    // landing back on the previous route. Skipping the call entirely when
    // nothing would actually change removes the race instead of trying to
    // out-time it.
    if (next.toString() === searchParams.toString()) return
    setSearchParams(next, { replace: true })
    // setSearchParams is stable across renders (react-router); omitting it
    // avoids re-running this purely for a new function identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.category, searchQuery])

  // Real per-category counts (see useCategoryArtworkCounts' own comment on
  // why this one query is worth it) — `undefined` while loading/on error,
  // in which case the sidebar/strip simply omit the number rather than
  // showing a fabricated or stale one.
  const countsQuery = useCategoryArtworkCounts()

  // Category-strip thumbnails: the same "newest published" page Home and
  // Categories already fetch (identical query key => shared cache, not a
  // new read) — reused here purely to find one real cover photo per
  // category, never a fabricated image.
  const recentQuery = useMarketplaceArtworks(DEFAULT_MARKETPLACE_FILTERS)
  const recentArtworks = recentQuery.data?.pages[0]?.artworks ?? []
  function coverFor(category: ArtworkCategory) {
    return recentArtworks.find((artwork) => artwork.category === category && artwork.images[0])?.images[0]?.url
  }

  // Real artist names for the sidebar — the exact same query (same key,
  // shared cache) MarketplaceGrid itself runs for the active filters, read
  // here a second time purely to populate the sidebar's list. Scoped to
  // artists who actually appear in the currently-loaded, currently-filtered
  // results — never a catalog-wide artist directory, since no such query
  // exists.
  const activeQuery = useMarketplaceArtworks(filters)
  const activeArtworks = activeQuery.data?.pages.flatMap((page) => page.artworks) ?? []
  const activeArtistNames = useArtistDisplayNames(activeArtworks.map((artwork) => artwork.sellerId))
  const artistOptions = Array.from(new Set(activeArtworks.map((artwork) => artwork.sellerId)))
    .map((sellerId) => activeArtistNames[sellerId])
    .filter((name): name is string => !!name)
    .filter((name) => name.toLowerCase().includes(artistQuery.trim().toLowerCase()))
    .sort((a, b) => a.localeCompare(b))

  function handleClearAll() {
    setFilters(DEFAULT_MARKETPLACE_FILTERS)
    setArtistQuery('')
  }

  function handleHeroSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // The input already updates `searchQuery` live — submitting the form
    // (Enter, or the Search button) has nothing further to do, since
    // MarketplaceGrid already re-filters on every keystroke. This handler
    // only exists so pressing Enter/clicking Search doesn't reload the page.
  }

  const filterSidebar = (
    <MarketplaceFilters
      filters={filters}
      onChange={setFilters}
      categoryCounts={countsQuery.data?.byCategory}
      totalCount={countsQuery.data?.total}
      artistQuery={artistQuery}
      onArtistQueryChange={setArtistQuery}
      artistOptions={artistOptions}
      onClearAll={handleClearAll}
    />
  )

  return (
    <Container size="wide">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <aside aria-label="Filters" className="hidden lg:sticky lg:top-20 lg:block lg:w-64 lg:shrink-0">
          <Card className="p-4">{filterSidebar}</Card>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {/* Hero — a gradient panel, deliberately not an image-backed
              hero like Home's: Home's real-artwork background already
              carries that treatment once for the app, and repeating it
              here would mean either a second, smaller/lower-fidelity
              image treatment or reusing the exact same photo twice on
              two different pages, neither of which reads as premium. */}
          <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-brand-primary/20 via-surface to-accent-gold/10 px-4 py-6 xs:px-6 sm:px-10 sm:py-10">
            <div className="relative flex flex-col gap-3">
              <p className="text-xs font-semibold tracking-[0.2em] text-accent-gold uppercase">Explore</p>
              <h1 className="font-display text-3xl font-medium text-text-primary sm:text-4xl">Art without boundaries</h1>
              <p className="max-w-md text-sm text-text-secondary">Discover original artworks from independent artists around the world.</p>
              <form role="search" onSubmit={handleHeroSearchSubmit} className="mt-2 flex max-w-lg items-center gap-2">
                <div className="relative flex-1">
                  <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted" />
                  <input
                    type="search"
                    aria-label="Search artworks by title"
                    placeholder="Search artworks by title…"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="h-11 w-full rounded-md border border-border-strong bg-surface-elevated py-2 pr-3 pl-9 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-brand-primary"
                  />
                </div>
                <Button type="submit" variant="gold" size="md">
                  Search
                </Button>
              </form>
            </div>
          </div>

          {/* Category strip — compact navigation tiles, not the taller
              browsing cards CategoriesPage itself uses; a real cover photo
              when one exists among the already-loaded "recently published"
              page, an icon fallback otherwise (see coverFor above).
              UI-01 mobile density correction (round 2): a forced 2-column
              grid squeezed each tile so far (icon + arrow eating most of the
              width) that longer labels like "Photography" truncated to
              "Photogra...". Below `sm` the strip now scrolls horizontally
              instead, so every tile sizes to its own label and nothing
              truncates; at `sm` and up (3-6 columns, more width per tile)
              it settles back into the original grid. */}
          <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0 lg:grid-cols-6">
            {CATEGORY_STRIP_ITEMS.map((category) => {
              const selected = filters.category === category
              const label = category ? CATEGORY_LABELS[category] : 'All'
              const Icon = category ? CATEGORY_ICON[category] : Grid2x2
              const coverUrl = category ? coverFor(category) : undefined
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setFilters({ ...filters, category })}
                  className={`group relative flex h-12 shrink-0 items-center gap-2 overflow-hidden rounded-lg border px-2.5 transition-colors duration-150 ease-standard sm:h-14 sm:px-3 ${
                    selected ? 'border-accent-gold bg-accent-gold/10' : 'border-border bg-surface hover:border-border-strong'
                  }`}
                >
                  {coverUrl ? (
                    <img src={coverUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                  ) : (
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded ${selected ? 'text-accent-gold' : 'text-text-muted'}`}>
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </span>
                  )}
                  <span className={`whitespace-nowrap text-sm font-medium ${selected ? 'text-accent-gold' : 'text-text-secondary group-hover:text-text-primary'}`}>
                    {label}
                  </span>
                  <ArrowRight aria-hidden="true" className="ml-auto h-3.5 w-3.5 shrink-0 text-text-muted opacity-0 transition-opacity duration-150 ease-standard group-hover:opacity-100" />
                </button>
              )
            })}
          </div>

          <MarketplaceGrid
            filters={filters}
            onFiltersChange={setFilters}
            searchQuery={searchQuery}
            artistQuery={artistQuery}
            onOpenFilters={() => setFiltersOpen(true)}
          />
        </div>
      </div>

      <Drawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters" side="right">
        <div className="flex flex-col gap-4">
          {filterSidebar}
          <Button type="button" onClick={() => setFiltersOpen(false)}>
            Show results
          </Button>
        </div>
      </Drawer>
    </Container>
  )
}
