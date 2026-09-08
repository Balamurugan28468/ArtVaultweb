import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Artwork } from '../types'

const getPublicArtwork = vi.fn()
vi.mock('../api/artworkRepository', () => ({ getPublicArtwork: (...args: unknown[]) => getPublicArtwork(...args) }))

beforeEach(() => {
  getPublicArtwork.mockReset()
})

const { usePublicArtwork } = await import('./usePublicArtwork')

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const now = Timestamp.now()

function buildArtwork(overrides: Partial<Artwork> = {}): Artwork {
  return {
    id: 'a1',
    sellerId: 'alice',
    title: 'Sunset',
    description: 'A painting.',
    price: 150000,
    category: 'painting',
    tags: [],
    images: [],
    inventoryCount: 1,
    status: 'PUBLISHED',
    reviewedAt: now,
    rejectionReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('usePublicArtwork', () => {
  it('resolves a real PUBLISHED artwork', async () => {
    getPublicArtwork.mockResolvedValue(buildArtwork())
    const { result } = renderHook(() => usePublicArtwork('a1'), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data?.id).toBe('a1')
    expect(getPublicArtwork).toHaveBeenCalledWith('a1')
  })

  it('resolves to null for a nonexistent artwork, exactly like a private one', async () => {
    getPublicArtwork.mockResolvedValue(null)
    const { result } = renderHook(() => usePublicArtwork('missing'), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data).toBeNull()
  })

  it('collapses a non-PUBLISHED artwork (e.g. the owner viewing their own DRAFT) to null — never renders it publicly', async () => {
    getPublicArtwork.mockResolvedValue(buildArtwork({ status: 'DRAFT' }))
    const { result } = renderHook(() => usePublicArtwork('a1'), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data).toBeNull()
  })

  it('surfaces a genuine failure as a real error state, not a silent null', async () => {
    getPublicArtwork.mockRejectedValue({ code: 'network', message: 'Network unavailable. Check your connection and try again.' })
    const { result } = renderHook(() => usePublicArtwork('a1'), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('never calls getPublicArtwork when no id is given', () => {
    renderHook(() => usePublicArtwork(undefined), { wrapper })
    expect(getPublicArtwork).not.toHaveBeenCalled()
  })
})
