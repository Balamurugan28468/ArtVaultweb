import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCreateArtwork } from './useCreateArtwork'

const createArtworkDraft = vi.fn()
vi.mock('../api/artworkRepository', () => ({ createArtworkDraft: (...args: unknown[]) => createArtworkDraft(...args) }))

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

beforeEach(() => {
  createArtworkDraft.mockReset()
  useAuth.mockReset()
})

const INPUT = { title: 't', description: 'd', price: 100, category: 'painting', tags: [], inventoryCount: 1 }

describe('useCreateArtwork', () => {
  it('throws without calling the repository when signed out', async () => {
    useAuth.mockReturnValue({ user: null })
    const { result } = renderHook(() => useCreateArtwork())

    await act(async () => {
      await expect(result.current.create(INPUT)).rejects.toBeTruthy()
    })

    expect(createArtworkDraft).not.toHaveBeenCalled()
    expect(result.current.status).toBe('error')
  })

  it('creates the artwork for the signed-in seller and returns its id', async () => {
    createArtworkDraft.mockResolvedValueOnce('a1')
    useAuth.mockReturnValue({ user: { uid: 'alice' } })
    const { result } = renderHook(() => useCreateArtwork())

    let id: string | undefined
    await act(async () => {
      id = await result.current.create(INPUT)
    })

    expect(createArtworkDraft).toHaveBeenCalledWith('alice', INPUT)
    expect(id).toBe('a1')
    expect(result.current.status).toBe('success')
  })
})
