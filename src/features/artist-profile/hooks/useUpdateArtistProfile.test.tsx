import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUpdateArtistProfile } from './useUpdateArtistProfile'

const updateArtistProfile = vi.fn()
vi.mock('../api/artistProfileRepository', () => ({
  updateArtistProfile: (...args: unknown[]) => updateArtistProfile(...args),
}))

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

beforeEach(() => {
  updateArtistProfile.mockReset()
  useAuth.mockReturnValue({ user: { uid: 'alice' } })
})

describe('useUpdateArtistProfile', () => {
  it('save() calls updateArtistProfile with the signed-in user\'s uid and reports success', async () => {
    updateArtistProfile.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useUpdateArtistProfile())

    await act(async () => {
      await result.current.save({ displayName: 'Alice Fine Art', bio: 'Oil paintings.' })
    })

    expect(updateArtistProfile).toHaveBeenCalledWith('alice', { displayName: 'Alice Fine Art', bio: 'Oil paintings.' })
    expect(result.current.status).toBe('success')
  })

  it('refuses to save and reports unauthenticated when no user is signed in', async () => {
    useAuth.mockReturnValue({ user: null })
    const { result } = renderHook(() => useUpdateArtistProfile())

    await act(async () => {
      await expect(result.current.save({ displayName: 'x', bio: 'y' })).rejects.toBeTruthy()
    })

    expect(updateArtistProfile).not.toHaveBeenCalled()
    expect(result.current.status).toBe('error')
    expect(result.current.error?.code).toBe('unauthenticated')
  })

  it('surfaces a typed error and rethrows when the write is denied', async () => {
    updateArtistProfile.mockRejectedValueOnce({ code: 'permission-denied', message: 'You do not have permission to do that.' })
    const { result } = renderHook(() => useUpdateArtistProfile())

    await act(async () => {
      await expect(result.current.save({ displayName: 'x', bio: 'y' })).rejects.toBeTruthy()
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error?.message).toBe('You do not have permission to do that.')
  })
})
