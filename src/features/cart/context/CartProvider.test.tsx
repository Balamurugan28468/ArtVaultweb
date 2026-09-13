import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
vi.mock('@/shared/ui', () => ({ useToast: () => toast }))

const subscribeCartQuantities = vi.fn()
const createCartItem = vi.fn()
const updateCartItemQuantity = vi.fn()
const removeCartItem = vi.fn()
vi.mock('../api/cartRepository', () => ({
  subscribeCartQuantities: (...args: unknown[]) => subscribeCartQuantities(...args),
  createCartItem: (...args: unknown[]) => createCartItem(...args),
  updateCartItemQuantity: (...args: unknown[]) => updateCartItemQuantity(...args),
  removeCartItem: (...args: unknown[]) => removeCartItem(...args),
}))

const guestStore = { current: new Map<string, number>() }
vi.mock('../api/guestCartStorage', () => ({
  getGuestCartQuantities: () => new Map(guestStore.current),
  setGuestCartItemQuantity: (id: string, quantity: number) => {
    guestStore.current.set(id, quantity)
  },
  removeGuestCartItem: (id: string) => {
    guestStore.current.delete(id)
  },
  clearGuestCart: () => {
    guestStore.current.clear()
  },
}))

const { useCart, CartProvider } = await import('./CartProvider')

beforeEach(() => {
  vi.clearAllMocks()
  guestStore.current = new Map()
  subscribeCartQuantities.mockImplementation((_uid: string, onData: (quantities: Map<string, number>) => void) => {
    onData(new Map())
    return vi.fn()
  })
})

describe('CartProvider — guest mode', () => {
  it('starts from whatever is already in local storage', () => {
    guestStore.current = new Map([['a1', 2]])
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null })
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider })
    expect(result.current.mode).toBe('guest')
    expect(result.current.getQuantity('a1')).toBe(2)
  })

  it('addItem adds a new line with quantity 1 by default and updates itemCount', async () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null })
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider })

    await act(async () => {
      await result.current.addItem('a1')
    })

    expect(result.current.getQuantity('a1')).toBe(1)
    expect(result.current.itemCount).toBe(1)
    expect(guestStore.current.get('a1')).toBe(1)
  })

  it('adding the same artwork again increases its quantity rather than duplicating a line', async () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null })
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider })

    // Each addItem is its own act() — matching a real user's two separate
    // "Add to Cart" clicks, each landing after the previous one's state
    // update has actually committed, rather than two calls racing against
    // the same stale closure within a single update.
    await act(async () => {
      await result.current.addItem('a1')
    })
    await act(async () => {
      await result.current.addItem('a1')
    })

    expect(result.current.getQuantity('a1')).toBe(2)
  })

  it('setQuantity changes an existing line to an exact quantity', async () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null })
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider })

    await act(async () => {
      await result.current.addItem('a1')
    })
    await act(async () => {
      await result.current.setQuantity('a1', 5)
    })

    expect(result.current.getQuantity('a1')).toBe(5)
  })

  it('removeItem removes the line entirely', async () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null })
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider })

    await act(async () => {
      await result.current.addItem('a1')
    })
    await act(async () => {
      await result.current.removeItem('a1')
    })

    expect(result.current.getQuantity('a1')).toBe(0)
    expect(guestStore.current.has('a1')).toBe(false)
  })

  it('never calls the Firestore repository while signed out', async () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null })
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider })
    await act(async () => {
      await result.current.addItem('a1')
    })
    expect(createCartItem).not.toHaveBeenCalled()
    expect(subscribeCartQuantities).not.toHaveBeenCalled()
  })
})

describe('CartProvider — account mode', () => {
  it('subscribes to the real cart for the signed-in uid', () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    subscribeCartQuantities.mockImplementationOnce((_uid, onData) => {
      onData(new Map([['a1', 3]]))
      return vi.fn()
    })
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider })
    expect(subscribeCartQuantities).toHaveBeenCalledWith('alice', expect.any(Function), expect.any(Function))
    expect(result.current.mode).toBe('account')
    expect(result.current.getQuantity('a1')).toBe(3)
  })

  it('addItem on a brand-new line creates a Firestore doc, not an update', async () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    createCartItem.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider })

    await act(async () => {
      await result.current.addItem('a1', 2)
    })

    expect(createCartItem).toHaveBeenCalledWith('alice', 'a1', 2)
    expect(updateCartItemQuantity).not.toHaveBeenCalled()
    expect(result.current.getQuantity('a1')).toBe(2)
  })

  it('addItem on an already-present line updates the quantity, not create', async () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    subscribeCartQuantities.mockImplementationOnce((_uid, onData) => {
      onData(new Map([['a1', 2]]))
      return vi.fn()
    })
    updateCartItemQuantity.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider })

    await act(async () => {
      await result.current.addItem('a1', 1)
    })

    expect(updateCartItemQuantity).toHaveBeenCalledWith('alice', 'a1', 3)
    expect(createCartItem).not.toHaveBeenCalled()
  })

  it('rolls back the optimistic change and shows an error toast when removeItem fails', async () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    subscribeCartQuantities.mockImplementationOnce((_uid, onData) => {
      onData(new Map([['a1', 2]]))
      return vi.fn()
    })
    removeCartItem.mockRejectedValueOnce({ code: 'unknown', message: 'boom' })
    const { result } = renderHook(() => useCart(), { wrapper: CartProvider })

    await act(async () => {
      await result.current.removeItem('a1')
    })

    expect(result.current.getQuantity('a1')).toBe(2)
    expect(toast.error).toHaveBeenCalledWith('boom')
  })

  it('merges local guest quantities into the account cart exactly once, adding on top of an existing server quantity, then clears local storage', async () => {
    guestStore.current = new Map([
      ['a1', 2],
      ['a2', 1],
    ])
    createCartItem.mockResolvedValue(undefined)
    updateCartItemQuantity.mockResolvedValue(undefined)
    subscribeCartQuantities.mockImplementationOnce((_uid, onData) => {
      onData(new Map([['a2', 3]])) // a2 already has 3 server-side
      return vi.fn()
    })
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    renderHook(() => useCart(), { wrapper: CartProvider })

    await waitFor(() => expect(createCartItem).toHaveBeenCalledWith('alice', 'a1', 2))
    await waitFor(() => expect(updateCartItemQuantity).toHaveBeenCalledWith('alice', 'a2', 4))
    await waitFor(() => expect(guestStore.current.size).toBe(0))
  })

  it('reverts to guest mode on sign-out', () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    subscribeCartQuantities.mockImplementationOnce((_uid, onData) => {
      onData(new Map([['a1', 1]]))
      return vi.fn()
    })
    const { result, rerender } = renderHook(() => useCart(), { wrapper: CartProvider })
    expect(result.current.mode).toBe('account')

    useAuth.mockReturnValue({ status: 'unauthenticated', user: null })
    rerender()
    expect(result.current.mode).toBe('guest')
  })
})
