import { useQuery } from '@tanstack/react-query'
import { getPublicArtwork } from '../api/artworkRepository'
import type { Artwork } from '../types'

/**
 * The public Artwork Detail page's own read (Module 11) — a one-shot,
 * cacheable TanStack Query read via `getPublicArtwork` (not `getArtwork`,
 * which Wishlist uses — see that function's own comment for why the two
 * need different error semantics), never a live `subscribeArtwork`
 * listener: a shared, cold-loadable link should cost one read per visit,
 * not hold a connection open for as long as a stranger's tab happens to
 * stay on the page.
 *
 * `select` additionally collapses "exists but isn't PUBLISHED" into the
 * same `null` result `getPublicArtwork` already gives for "doesn't exist"/
 * "read denied." This matters even though `firestore.rules` would happily
 * return an owner's own DRAFT/SUBMITTED/REJECTED artwork to *that owner* —
 * this is the public detail route, so a seller opening their own
 * unpublished artwork's public link must see the same generic "not
 * available" state anyone else would, never a leak of unpublished content
 * through the public page. Seller Studio's own `useArtwork`/
 * `subscribeArtwork` is the correct, separate path for an owner to view/
 * edit a non-public artwork.
 */
export function usePublicArtwork(id: string | undefined) {
  return useQuery({
    queryKey: ['artwork', 'public', id],
    queryFn: () => getPublicArtwork(id as string),
    enabled: Boolean(id),
    select: (artwork: Artwork | null) => (artwork && artwork.status === 'PUBLISHED' ? artwork : null),
  })
}
