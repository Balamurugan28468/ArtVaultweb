import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useCart = vi.fn()
vi.mock('../context/CartProvider', () => ({ useCart: () => useCart() }))

const getArtwork = vi.fn()
vi.mock('@/features/artwork', () => ({ getArtwork: (...args: unknown[]) => getArtwork(...args) }))

beforeEach(() => {
  getArtwork.mockReset()
})

const { useCartLines } = await import('./useCartLines')

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useCartLines', () => {
  it('resolves each cart id to its current artwork data and computes a real line total from the live price', async () => {
    useCart.mockReturnValue({ quantities: new Map([['a1', 2]]), status: 'ready' })
    getArtwork.mockResolvedValue({ id: 'a1', price: 150000, title: 'Sunset' })

    const { result } = renderHook(() => useCartLines(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lines).toEqual([{ artwork: { id: 'a1', price: 150000, title: 'Sunset' }, quantity: 2, lineTotal: 300000 }])
    expect(result.current.subtotal).toBe(300000)
  })

  it('sums lineTotal across multiple lines for the subtotal', async () => {
    useCart.mockReturnValue({
      quantities: new Map([
        ['a1', 1],
        ['a2', 3],
      ]),
      status: 'ready',
    })
    getArtwork.mockImplementation((id: string) =>
      Promise.resolve(id === 'a1' ? { id, price: 100000 } : { id, price: 50000 }),
    )

    const { result } = renderHook(() => useCartLines(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // a1: 100000 * 1 = 100000, a2: 50000 * 3 = 150000 -> 250000
    expect(result.current.subtotal).toBe(250000)
  })

  it('excludes an id whose artwork no longer resolves (deleted or unpublished) and counts it, without it affecting the subtotal', async () => {
    useCart.mockReturnValue({
      quantities: new Map([
        ['a1', 1],
        ['gone', 2],
      ]),
      status: 'ready',
    })
    getArtwork.mockImplementation((id: string) => Promise.resolve(id === 'gone' ? null : { id, price: 100000 }))

    const { result } = renderHook(() => useCartLines(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lines.map((line) => line.artwork.id)).toEqual(['a1'])
    expect(result.current.unavailableCount).toBe(1)
    expect(result.current.subtotal).toBe(100000)
  })

  it('returns an empty result for an empty cart, without calling getArtwork', () => {
    useCart.mockReturnValue({ quantities: new Map(), status: 'ready' })
    const { result } = renderHook(() => useCartLines(), { wrapper })
    expect(result.current.lines).toEqual([])
    expect(result.current.subtotal).toBe(0)
    expect(getArtwork).not.toHaveBeenCalled()
  })

  it('reports isLoading while the underlying cart itself is still loading', () => {
    useCart.mockReturnValue({ quantities: new Map(), status: 'loading' })
    const { result } = renderHook(() => useCartLines(), { wrapper })
    expect(result.current.isLoading).toBe(true)
  })
})
