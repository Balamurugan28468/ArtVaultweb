import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

const toastError = vi.fn()
vi.mock('@/shared/ui', () => ({ useToast: () => ({ error: toastError, success: vi.fn(), info: vi.fn() }) }))

const navigate = vi.fn()
vi.mock('react-router', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: '/artworks/a1' }),
}))

const hasLiked = vi.fn()
const likeArtwork = vi.fn()
const unlikeArtwork = vi.fn()
const getAuthoritativeLikeState = vi.fn()
vi.mock('../api/likeRepository', () => ({
  hasLiked: (...args: unknown[]) => hasLiked(...args),
  likeArtwork: (...args: unknown[]) => likeArtwork(...args),
  unlikeArtwork: (...args: unknown[]) => unlikeArtwork(...args),
  getAuthoritativeLikeState: (...args: unknown[]) => getAuthoritativeLikeState(...args),
}))

const { useLike } = await import('./useLike')

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  useAuth.mockReset()
  navigate.mockReset()
  toastError.mockReset()
  hasLiked.mockReset()
  likeArtwork.mockReset()
  unlikeArtwork.mockReset()
  getAuthoritativeLikeState.mockReset()
})

describe('useLike — signed out', () => {
  it('reports unliked and never calls hasLiked while signed out', () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null })
    const { result } = renderHook(() => useLike('a1', 5), { wrapper })
    expect(result.current.liked).toBe(false)
    expect(result.current.count).toBe(5)
    expect(hasLiked).not.toHaveBeenCalled()
  })

  it('redirects to sign-in (with the current path) instead of writing anything, on activation', () => {
    useAuth.mockReturnValue({ status: 'unauthenticated', user: null })
    const { result } = renderHook(() => useLike('a1', 5), { wrapper })
    act(() => result.current.toggle())
    expect(navigate).toHaveBeenCalledWith('/sign-in', { state: { from: '/artworks/a1' } })
    expect(likeArtwork).not.toHaveBeenCalled()
  })
})

describe('useLike — signed in', () => {
  it('resolves the real liked state from Firestore', async () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    hasLiked.mockResolvedValue(true)
    const { result } = renderHook(() => useLike('a1', 5), { wrapper })
    await waitFor(() => expect(result.current.liked).toBe(true))
    expect(hasLiked).toHaveBeenCalledWith('a1', 'alice')
  })

  it('like: optimistically flips liked/count immediately, then confirms after the write resolves', async () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    hasLiked.mockResolvedValue(false)
    let resolveWrite: () => void = () => {}
    likeArtwork.mockReturnValue(new Promise<void>((resolve) => (resolveWrite = resolve)))

    const { result } = renderHook(() => useLike('a1', 5), { wrapper })
    await waitFor(() => expect(result.current.liked).toBe(false))

    act(() => result.current.toggle())
    expect(result.current.liked).toBe(true)
    expect(result.current.count).toBe(6)
    expect(result.current.pending).toBe(true)
    expect(likeArtwork).toHaveBeenCalledWith('a1', 'alice')

    await act(async () => {
      resolveWrite()
      await Promise.resolve()
    })
    expect(result.current.pending).toBe(false)
    expect(result.current.liked).toBe(true)
  })

  it('unlike: optimistically flips liked/count immediately', async () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    hasLiked.mockResolvedValue(true)
    unlikeArtwork.mockResolvedValue(undefined)

    const { result } = renderHook(() => useLike('a1', 5), { wrapper })
    await waitFor(() => expect(result.current.liked).toBe(true))

    act(() => result.current.toggle())
    expect(result.current.liked).toBe(false)
    expect(result.current.count).toBe(4)
    expect(unlikeArtwork).toHaveBeenCalledWith('a1', 'alice')
  })

  it('ignores a second activation while a write is still pending — never a duplicate increment/decrement', async () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    hasLiked.mockResolvedValue(false)
    likeArtwork.mockReturnValue(new Promise<void>(() => {}))

    const { result } = renderHook(() => useLike('a1', 5), { wrapper })
    await waitFor(() => expect(result.current.liked).toBe(false))

    act(() => result.current.toggle())
    act(() => result.current.toggle())
    expect(likeArtwork).toHaveBeenCalledTimes(1)
  })

  it('a genuine like failure (authoritative state proves nothing changed) rolls back and surfaces the real error — never hidden', async () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    hasLiked.mockResolvedValue(false)
    likeArtwork.mockRejectedValue({ code: 'permission-denied', message: 'You do not have permission to do that.' })
    // Ground truth after the rejection: still not liked, count unmoved — proves this was a genuine denial, not an ambiguous race.
    getAuthoritativeLikeState.mockResolvedValue({ liked: false, likeCount: 5 })

    const { result } = renderHook(() => useLike('a1', 5), { wrapper })
    await waitFor(() => expect(result.current.liked).toBe(false))

    await act(async () => {
      result.current.toggle()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.liked).toBe(false)
    expect(result.current.count).toBe(5)
    expect(result.current.pending).toBe(false)
    expect(toastError).toHaveBeenCalledWith('You do not have permission to do that.')
  })

  it('a genuine unlike failure (authoritative state proves nothing changed) rolls back and surfaces the real error', async () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    hasLiked.mockResolvedValue(true)
    unlikeArtwork.mockRejectedValue({ code: 'network', message: 'Network unavailable. Check your connection and try again.' })
    getAuthoritativeLikeState.mockResolvedValue({ liked: true, likeCount: 5 })

    const { result } = renderHook(() => useLike('a1', 5), { wrapper })
    await waitFor(() => expect(result.current.liked).toBe(true))

    await act(async () => {
      result.current.toggle()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.liked).toBe(true)
    expect(result.current.count).toBe(5)
    expect(toastError).toHaveBeenCalledWith('Network unavailable. Check your connection and try again.')
  })

  it('an ambiguous rejected like — authoritative state proves it actually landed — reconciles to liked:true with the real count, no error toast', async () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    hasLiked.mockResolvedValue(false)
    likeArtwork.mockRejectedValue({ code: 'permission-denied', message: 'You do not have permission to do that.' })
    // Ground truth: the write actually committed (e.g. a same-account concurrent tab), despite the rejection.
    getAuthoritativeLikeState.mockResolvedValue({ liked: true, likeCount: 9 })

    const { result } = renderHook(() => useLike('a1', 5), { wrapper })
    await waitFor(() => expect(result.current.liked).toBe(false))

    await act(async () => {
      result.current.toggle()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.liked).toBe(true)
    expect(result.current.count).toBe(9)
    expect(result.current.pending).toBe(false)
    expect(toastError).not.toHaveBeenCalled()
  })

  it('an ambiguous rejected unlike — authoritative state proves it actually landed — reconciles to liked:false with the real count, no error toast', async () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    hasLiked.mockResolvedValue(true)
    unlikeArtwork.mockRejectedValue({ code: 'permission-denied', message: 'You do not have permission to do that.' })
    getAuthoritativeLikeState.mockResolvedValue({ liked: false, likeCount: 4 })

    const { result } = renderHook(() => useLike('a1', 5), { wrapper })
    await waitFor(() => expect(result.current.liked).toBe(true))

    await act(async () => {
      result.current.toggle()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.liked).toBe(false)
    expect(result.current.count).toBe(4)
    expect(toastError).not.toHaveBeenCalled()
  })

  it('reconciliation never fires merely because the write was rejected — only when ground truth actually proves the desired end state', async () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    hasLiked.mockResolvedValue(false)
    likeArtwork.mockRejectedValue({ code: 'unknown', message: 'Something went wrong. Please try again.' })
    // A genuinely unrelated/stale reconciliation read (still not liked) must never be
    // mistaken for success just because a rejection occurred.
    getAuthoritativeLikeState.mockResolvedValue({ liked: false, likeCount: 5 })

    const { result } = renderHook(() => useLike('a1', 5), { wrapper })
    await waitFor(() => expect(result.current.liked).toBe(false))

    await act(async () => {
      result.current.toggle()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.liked).toBe(false)
    expect(result.current.count).toBe(5)
    expect(toastError).toHaveBeenCalledWith('Something went wrong. Please try again.')
  })

  it('if the reconciliation read itself fails, falls back to the ordinary rollback rather than guessing', async () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    hasLiked.mockResolvedValue(false)
    likeArtwork.mockRejectedValue({ code: 'permission-denied', message: 'You do not have permission to do that.' })
    getAuthoritativeLikeState.mockRejectedValue({ code: 'network', message: 'Network unavailable. Check your connection and try again.' })

    const { result } = renderHook(() => useLike('a1', 5), { wrapper })
    await waitFor(() => expect(result.current.liked).toBe(false))

    await act(async () => {
      result.current.toggle()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.liked).toBe(false)
    expect(result.current.count).toBe(5)
    expect(toastError).toHaveBeenCalledWith('You do not have permission to do that.')
  })

  it('resets optimistic state and re-fetches when the signed-in uid changes — no cross-account bleed', async () => {
    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'alice' } })
    hasLiked.mockResolvedValueOnce(true)

    const { result, rerender } = renderHook(({ artworkId, count }) => useLike(artworkId, count), {
      wrapper,
      initialProps: { artworkId: 'a1', count: 5 },
    })
    await waitFor(() => expect(result.current.liked).toBe(true))

    useAuth.mockReturnValue({ status: 'authenticated', user: { uid: 'bob' } })
    hasLiked.mockResolvedValueOnce(false)
    rerender({ artworkId: 'a1', count: 5 })

    await waitFor(() => expect(hasLiked).toHaveBeenCalledWith('a1', 'bob'))
    await waitFor(() => expect(result.current.liked).toBe(false))
  })
})
