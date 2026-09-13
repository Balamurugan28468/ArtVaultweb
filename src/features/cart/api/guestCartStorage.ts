import { CART_MAX_QUANTITY } from '../types'

const STORAGE_KEY = 'artvault:guestCart'

/**
 * Same try/catch-everything discipline as guestWishlistStorage — a guest
 * whose browser blocks localStorage (private browsing, storage disabled by
 * policy, quota exceeded) simply gets a cart that doesn't survive a
 * refresh, never a crash.
 */
function readEntries(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const entries: Record<string, number> = {}
    for (const [artworkId, quantity] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0) {
        entries[artworkId] = Math.min(CART_MAX_QUANTITY, Math.max(1, Math.trunc(quantity)))
      }
    }
    return entries
  } catch {
    return {}
  }
}

function writeEntries(entries: Record<string, number>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Storage unavailable — the guest cart simply won't persist across a
    // refresh this session; never throw for this.
  }
}

export function getGuestCartQuantities(): Map<string, number> {
  return new Map(Object.entries(readEntries()))
}

export function setGuestCartItemQuantity(artworkId: string, quantity: number): void {
  const entries = readEntries()
  entries[artworkId] = Math.min(CART_MAX_QUANTITY, Math.max(1, Math.trunc(quantity)))
  writeEntries(entries)
}

export function removeGuestCartItem(artworkId: string): void {
  const entries = readEntries()
  delete entries[artworkId]
  writeEntries(entries)
}

/** Called only after every entry has been successfully written to the account's real Firestore cart. */
export function clearGuestCart(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing further to do — see readEntries()/writeEntries() above.
  }
}
