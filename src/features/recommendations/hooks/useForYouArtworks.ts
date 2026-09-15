import { useQuery } from '@tanstack/react-query'
import { DEFAULT_MARKETPLACE_FILTERS, fetchMarketplacePage } from '@/features/marketplace'
import { useWishlistArtworks } from '@/features/wishlist'
import type { Artwork, ArtworkCategory } from '@/features/artwork'

export interface ForYouResult {
  status: 'loading' | 'success' | 'error'
  artworks: Artwork[]
  /** Whether the result is actually shaped by the viewer's own real activity, or just the honest newest-overall fallback. */
  personalized: boolean
}

/**
 * "For You" — UI-05's Recommendations page. Real signal only: the
 * distinct categories of whatever the viewer has genuinely saved to their
 * Wishlist (guest or signed-in — see useWishlistArtworks), each queried
 * for its newest PUBLISHED artworks via the exact same Firestore-native
 * query Explore/Related already use, merged and deduplicated. No AI
 * ranking of any kind exists (see docs/AI_ARCHITECTURE.md) — this is
 * plain recency within a real interest signal, never fabricated.
 * Falls back to newest-overall (with `personalized: false`, so the page
 * can say so honestly) when the viewer has no Wishlist activity yet.
 */
export function useForYouArtworks(): ForYouResult {
  const wishlist = useWishlistArtworks()
  const categories = Array.from(new Set(wishlist.artworks.map((artwork) => artwork.category)))
  const savedIds = new Set(wishlist.artworks.map((artwork) => artwork.id))

  const categoryQueries = useQuery({
    queryKey: ['recommendations', 'forYou', 'byCategory', categories],
    queryFn: async () => {
      const pages = await Promise.all(
        categories.map((category) => fetchMarketplacePage({ ...DEFAULT_MARKETPLACE_FILTERS, category }, null)),
      )
      return pages.flatMap((page) => page.artworks)
    },
    enabled: categories.length > 0,
  })

  const fallbackQuery = useQuery({
    queryKey: ['recommendations', 'forYou', 'fallback'],
    queryFn: () => fetchMarketplacePage(DEFAULT_MARKETPLACE_FILTERS, null),
    enabled: categories.length === 0 && !wishlist.isLoading,
  })

  if (wishlist.isLoading || (categories.length > 0 && categoryQueries.isLoading)) {
    return { status: 'loading', artworks: [], personalized: categories.length > 0 }
  }

  if (categories.length > 0) {
    if (categoryQueries.status === 'error') return { status: 'error', artworks: [], personalized: true }
    const merged = dedupeAndExclude(categoryQueries.data ?? [], savedIds)
    return { status: 'success', artworks: merged, personalized: true }
  }

  if (fallbackQuery.isLoading) return { status: 'loading', artworks: [], personalized: false }
  if (fallbackQuery.status === 'error') return { status: 'error', artworks: [], personalized: false }
  return { status: 'success', artworks: (fallbackQuery.data?.artworks ?? []).slice(0, 8), personalized: false }
}

/**
 * "Similar Artworks" — a tighter, single-anchor variant of the same real
 * signal: only the *first* category among the viewer's real Wishlist
 * items (arbitrary but deterministic — never a guess at which item is
 * "most relevant", since Wishlist doesn't track that). Genuinely empty
 * (not a fallback) when there's no real Wishlist activity to anchor on —
 * this tab is meant to answer "similar to what, exactly?", which a
 * fabricated fallback would misrepresent.
 */
export function useSimilarArtworks(): { status: 'loading' | 'success' | 'error'; artworks: Artwork[]; anchorCategory: ArtworkCategory | null } {
  const wishlist = useWishlistArtworks()
  const anchorCategory = wishlist.artworks[0]?.category ?? null
  const savedIds = new Set(wishlist.artworks.map((artwork) => artwork.id))

  const query = useQuery({
    queryKey: ['recommendations', 'similar', anchorCategory],
    queryFn: () => fetchMarketplacePage({ ...DEFAULT_MARKETPLACE_FILTERS, category: anchorCategory }, null),
    enabled: anchorCategory != null,
  })

  if (wishlist.isLoading) return { status: 'loading', artworks: [], anchorCategory: null }
  if (!anchorCategory) return { status: 'success', artworks: [], anchorCategory: null }
  if (query.isLoading) return { status: 'loading', artworks: [], anchorCategory }
  if (query.status === 'error') return { status: 'error', artworks: [], anchorCategory }

  return { status: 'success', artworks: dedupeAndExclude(query.data?.artworks ?? [], savedIds), anchorCategory }
}

function dedupeAndExclude(artworks: Artwork[], excludeIds: Set<string>): Artwork[] {
  const seen = new Set<string>()
  const result: Artwork[] = []
  for (const artwork of artworks) {
    if (excludeIds.has(artwork.id) || seen.has(artwork.id)) continue
    seen.add(artwork.id)
    result.push(artwork)
  }
  return result.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()).slice(0, 8)
}
