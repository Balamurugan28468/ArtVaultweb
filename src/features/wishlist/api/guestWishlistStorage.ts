const STORAGE_KEY = 'artvault:guestWishlist'
const TOAST_SHOWN_KEY = 'artvault:guestWishlistToastShown'

/**
 * The entire guest wishlist mechanism is wrapped in try/catch: `localStorage`
 * can throw (private/incognito browsing in some browsers, storage disabled
 * by policy, quota exceeded) — none of that should ever crash the save
 * button. A guest whose browser blocks storage simply gets a wishlist that
 * doesn't survive a refresh, which is the same experience as not having
 * this feature at all, not a broken one.
 */
function readIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writeIds(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Storage unavailable — the guest wishlist simply won't persist across
    // a refresh this session; never throw for this.
  }
}

export function getGuestWishlistIds(): string[] {
  return readIds()
}

export function addGuestWishlistId(artworkId: string): void {
  const ids = readIds()
  if (!ids.includes(artworkId)) writeIds([...ids, artworkId])
}

export function removeGuestWishlistId(artworkId: string): void {
  writeIds(readIds().filter((id) => id !== artworkId))
}

/** Called only after every id has been successfully written to the account's real Firestore wishlist. */
export function clearGuestWishlist(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing further to do — see readIds()/writeIds() above.
  }
}

/** A guest sees the "Saved" toast explaining local-only save once per browser, not on every tap. */
export function hasShownGuestSaveToast(): boolean {
  try {
    return localStorage.getItem(TOAST_SHOWN_KEY) === '1'
  } catch {
    return false
  }
}

export function markGuestSaveToastShown(): void {
  try {
    localStorage.setItem(TOAST_SHOWN_KEY, '1')
  } catch {
    // Non-fatal — worst case the toast shows again next time.
  }
}
