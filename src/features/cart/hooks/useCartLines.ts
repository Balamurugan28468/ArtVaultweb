import { useQueries } from '@tanstack/react-query'
import { getArtwork, type Artwork } from '@/features/artwork'
import { useCart } from '../context/CartProvider'

export interface CartLine {
  artwork: Artwork
  quantity: number
  /** `artwork.price * quantity`, in the same minor-currency-unit integer as `artwork.price` — never a client-trusted final total (see CartSummary). */
  lineTotal: number
}

export interface CartLinesResult {
  lines: CartLine[]
  /** Cart entries whose artwork no longer resolves (deleted, or no longer PUBLISHED) — shown as a count, not silently dropped. Same contract as useWishlistArtworks' unavailableCount. */
  unavailableCount: number
  subtotal: number
  isLoading: boolean
}

/**
 * Resolves the current session's cart quantities (from CartProvider) into
 * their *live* Artwork data — one one-shot read per id via getArtwork,
 * deduplicated/cached by TanStack Query, never a listener per line. Price
 * always comes from the live artwork document, never from anything stored
 * in the cart item itself, so a seller's price change is reflected
 * immediately rather than charging a stale amount — and matches the
 * product-wide rule that the backend (here, artworks/{id}.price) stays the
 * only authoritative source for price.
 */
export function useCartLines(): CartLinesResult {
  const { quantities, status } = useCart()
  const artworkIds = Array.from(quantities.keys())

  const results = useQueries({
    queries: artworkIds.map((id) => ({
      queryKey: ['cart', 'artwork', id],
      queryFn: () => getArtwork(id),
      staleTime: 30_000,
    })),
  })

  const isLoading = status === 'loading' || results.some((result) => result.isLoading)

  const lines: CartLine[] = []
  artworkIds.forEach((id, index) => {
    const artwork = results[index]?.data
    if (!artwork) return
    const quantity = quantities.get(id) ?? 1
    lines.push({ artwork, quantity, lineTotal: artwork.price * quantity })
  })

  const unavailableCount = isLoading ? 0 : artworkIds.length - lines.length
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0)

  return { lines, unavailableCount, subtotal, isLoading }
}
