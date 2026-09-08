import { useState } from 'react'
import { DEFAULT_MARKETPLACE_FILTERS, MarketplaceFilters, MarketplaceGrid, type MarketplaceFiltersState } from '@/features/marketplace'
import { Container, PageHeader } from '@/shared/ui'

/**
 * ArtVault's first cross-seller public discovery surface (Module 08) — the
 * sequel to Module 06/07's single-artist public page. Deliberately not
 * nested inside RequireAuth (see router.tsx): works whether or not anyone
 * is signed in, matching every other public route so far. Filter state
 * lives here, not in a global store — it's read by exactly one component
 * tree (this page) and never needs to survive navigating away, so a
 * Zustand store would be pure ceremony for state that already has a
 * natural, single owner.
 */
export function MarketplacePage() {
  const [filters, setFilters] = useState<MarketplaceFiltersState>(DEFAULT_MARKETPLACE_FILTERS)

  return (
    <Container>
      <section className="flex flex-col gap-6">
        <PageHeader title="Explore" description="Browse published artworks from every artist on ArtVault." />
        <MarketplaceFilters filters={filters} onChange={setFilters} />
        <MarketplaceGrid filters={filters} />
      </section>
    </Container>
  )
}
