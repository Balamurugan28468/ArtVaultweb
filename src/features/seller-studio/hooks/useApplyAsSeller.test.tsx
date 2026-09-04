import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useApplyAsSeller } from './useApplyAsSeller'

const applyAsSeller = vi.fn()
vi.mock('../api/sellerRepository', () => ({ applyAsSeller: (...args: unknown[]) => applyAsSeller(...args) }))

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

beforeEach(() => {
  applyAsSeller.mockReset()
  useAuth.mockReset()
})

const INPUT = { businessName: 'Alice Fine Art', description: 'desc', contactEmail: 'alice@example.com' }

describe('useApplyAsSeller', () => {
  it('errors without calling the repository when signed out', async () => {
    useAuth.mockReturnValue({ user: null })
    const { result } = renderHook(() => useApplyAsSeller())

    await act(async () => {
      await result.current.apply(INPUT)
    })

    expect(applyAsSeller).not.toHaveBeenCalled()
    expect(result.current.status).toBe('error')
    expect(result.current.error?.code).toBe('unauthenticated')
  })

  it('applies for the signed-in user and reports success', async () => {
    applyAsSeller.mockResolvedValueOnce(undefined)
    useAuth.mockReturnValue({ user: { uid: 'alice' } })
    const { result } = renderHook(() => useApplyAsSeller())

    await act(async () => {
      await result.current.apply(INPUT)
    })

    expect(applyAsSeller).toHaveBeenCalledWith('alice', INPUT)
    expect(result.current.status).toBe('success')
  })

  it('surfaces a typed error and rethrows on failure', async () => {
    applyAsSeller.mockRejectedValueOnce({ code: 'permission-denied', message: 'You do not have permission to do that.' })
    useAuth.mockReturnValue({ user: { uid: 'alice' } })
    const { result } = renderHook(() => useApplyAsSeller())

    await act(async () => {
      await expect(result.current.apply(INPUT)).rejects.toBeTruthy()
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error?.message).toBe('You do not have permission to do that.')
  })
})
