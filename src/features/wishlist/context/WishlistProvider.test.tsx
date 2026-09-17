import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
vi.mock('@/shared/ui', () => ({ useToast: () => toast }))

const subscribeWishlistIds = vi.fn()
const addWishlistItem = vi.fn()
const removeWishlistItem = vi.fn()
vi.mock('../api/wishlistRepository', () => ({
  subscribeWishlistIds: (...args: unknown[]) => subscribeWishlistIds(...args),
  addWishlistItem: (...args: unknown[]) => addWishlistItem(...args),
  removeWishlistItem: (...args: unknown[]) => removeWishlistItem(...args),
}))

const guestStore = { current: [] as string[], toastShown: false }
vi.mock('../api/guestWishlistStorage', () => ({
  getGuestWishlistIds: () => guestStore.current,
  addGuestWishlistId: (id: string) => {
    if (!guestStore.current.includes(id)) guestStore.current = [...guestStore.current, id]
  },
  removeGuestWishlistId: (id: string) => {
    guestStore.current = guestStore.current.filter((existing) => existing !== id)
  },
  clearGuestWishlist: () => {
    guestStore.current = []
  },
  hasShownGuestSaveToast: () => guestStore.toastShown,
  markGuestSaveToastShown: () => {
    guestStore.toastShown = true
  },
}))

const { useWishlist, WishlistProvider } = await import('./WishlistProvider')

beforeEach(() => {
  vi.clearAllMocks()
  guestStore.current = []
  guestStore.toastShown = false
  subscribeWishlistIds.mockImplementation((_uid: string, onData: (ids: Set<string>) => void) => {
    onData(new Set())
    return vi.fn()
  })
})

describe('WishlistProvider — guest mode', () => {
  it('starts from whatever is already in local storage', () => {
    guestStore.current = ['a1']
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null })
    const { result } = renderHook(() => useWishlist(), { wrapper: WishlistProvider })
    expect(result.current.mode).toBe('guest')
    expect(result.current.isSaved('a1')).toBe(true)
  })

  it('toggle saves locally and updates isSaved immediately (optimistic)', async () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null })
    const { result } = renderHook(() => useWishlist(), { wrapper: WishlistProvider })

    await act(async () => {
      await result.current.toggle('a1')
    })

    expect(result.current.isSaved('a1')).toBe(true)
    expect(guestStore.current).toEqual(['a1'])
  })

  it('toggle again removes it', async () => {
    guestStore.current = ['a1']
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null })
    const { result } = renderHook(() => useWishlist(), { wrapper: WishlistProvider })
    expect(result.current.isSaved('a1')).toBe(true)

    await act(async () => {
      await result.current.toggle('a1')
    })

    expect(result.current.isSaved('a1')).toBe(false)
    expect(guestStore.current).toEqual([])
  })

  it('shows the "Saved" toast on the first guest save, but not on a second one', async () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null })
    const { result } = renderHook(() => useWishlist(), { wrapper: WishlistProvider })

    await act(async () => {
      await result.current.toggle('a1')
    })
    expect(toast.info).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.toggle('a2')
    })
    expect(toast.info).toHaveBeenCalledTimes(1)
  })

  it('never calls the Firestore repository while signed out', async () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null })
    const { result } = renderHook(() => useWishlist(), { wrapper: WishlistProvider })
    await act(async () => {
      await result.current.toggle('a1')
    })
    expect(addWishlistItem).not.toHaveBeenCalled()
    expect(subscribeWishlistIds).not.toHaveBeenCalled()
  })
})

describe('WishlistProvider — account mode', () => {
  it('subscribes to the real wishlist for the signed-in uid', () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    subscribeWishlistIds.mockImplementationOnce((_uid, onData) => {
      onData(new Set(['a1']))
      return vi.fn()
    })
    const { result } = renderHook(() => useWishlist(), { wrapper: WishlistProvider })
    expect(subscribeWishlistIds).toHaveBeenCalledWith('alice', expect.any(Function), expect.any(Function))
    expect(result.current.mode).toBe('account')
    expect(result.current.isSaved('a1')).toBe(true)
  })

  it('toggle writes to Firestore and reflects optimistically', async () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    addWishlistItem.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useWishlist(), { wrapper: WishlistProvider })

    await act(async () => {
      await result.current.toggle('a1')
    })

    expect(addWishlistItem).toHaveBeenCalledWith('alice', 'a1')
    expect(result.current.isSaved('a1')).toBe(true)
  })

  it('rolls back the optimistic change and shows an error toast when the write fails', async () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    addWishlistItem.mockRejectedValueOnce({ code: 'unknown', message: 'boom' })
    const { result } = renderHook(() => useWishlist(), { wrapper: WishlistProvider })

    await act(async () => {
      await result.current.toggle('a1')
    })

    expect(result.current.isSaved('a1')).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('boom')
  })

  it('merges local guest ids into the account wishlist exactly once, then clears local storage', async () => {
    guestStore.current = ['a1', 'a2']
    addWishlistItem.mockResolvedValue(undefined)
    subscribeWishlistIds.mockImplementationOnce((_uid, onData) => {
      onData(new Set(['a2'])) // a2 already saved server-side
      return vi.fn()
    })
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    renderHook(() => useWishlist(), { wrapper: WishlistProvider })

    await waitFor(() => expect(addWishlistItem).toHaveBeenCalledWith('alice', 'a1'))
    expect(addWishlistItem).not.toHaveBeenCalledWith('alice', 'a2')
    await waitFor(() => expect(guestStore.current).toEqual([]))
  })

  it('never touches an existing server entry during merge (no duplicate write)', async () => {
    guestStore.current = ['a1']
    subscribeWishlistIds.mockImplementationOnce((_uid, onData) => {
      onData(new Set(['a1']))
      return vi.fn()
    })
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    renderHook(() => useWishlist(), { wrapper: WishlistProvider })

    await waitFor(() => expect(guestStore.current).toEqual([]))
    expect(addWishlistItem).not.toHaveBeenCalled()
  })

  it('reverts to guest mode on sign-out', () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    subscribeWishlistIds.mockImplementationOnce((_uid, onData) => {
      onData(new Set(['a1']))
      return vi.fn()
    })
    const { result, rerender } = renderHook(() => useWishlist(), { wrapper: WishlistProvider })
    expect(result.current.mode).toBe('account')

    useAuth.mockReturnValue({ status: 'unauthenticated', user: null })
    rerender()
    expect(result.current.mode).toBe('guest')
  })
})

it('returns false when a save fails so Cart cannot remove the item', async () => {
  useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
  addWishlistItem.mockRejectedValueOnce({ code: 'network', message: 'Offline' })
  const { result } = renderHook(() => useWishlist(), { wrapper: WishlistProvider })
  await act(async () => { expect(await result.current.toggle('a1')).toBe(false) })
  expect(result.current.isSaved('a1')).toBe(false)
})
