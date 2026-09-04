import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUpdateArtwork } from './useUpdateArtwork'

const updateArtworkDraft = vi.fn()
const submitArtwork = vi.fn()
const deleteArtworkDraft = vi.fn()
vi.mock('../api/artworkRepository', () => ({
  updateArtworkDraft: (...args: unknown[]) => updateArtworkDraft(...args),
  submitArtwork: (...args: unknown[]) => submitArtwork(...args),
  deleteArtworkDraft: (...args: unknown[]) => deleteArtworkDraft(...args),
}))

beforeEach(() => {
  updateArtworkDraft.mockReset()
  submitArtwork.mockReset()
  deleteArtworkDraft.mockReset()
})

const INPUT = { title: 't', description: 'd', price: 100, category: 'painting', tags: [], inventoryCount: 1 }

describe('useUpdateArtwork', () => {
  it('update() calls updateArtworkDraft and reports success', async () => {
    updateArtworkDraft.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useUpdateArtwork())

    await act(async () => {
      await result.current.update('a1', INPUT)
    })

    expect(updateArtworkDraft).toHaveBeenCalledWith('a1', INPUT)
    expect(result.current.status).toBe('success')
  })

  it('submit() calls submitArtwork', async () => {
    submitArtwork.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useUpdateArtwork())

    await act(async () => {
      await result.current.submit('a1')
    })

    expect(submitArtwork).toHaveBeenCalledWith('a1')
    expect(result.current.status).toBe('success')
  })

  it('remove() calls deleteArtworkDraft', async () => {
    deleteArtworkDraft.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useUpdateArtwork())

    await act(async () => {
      await result.current.remove('a1')
    })

    expect(deleteArtworkDraft).toHaveBeenCalledWith('a1')
    expect(result.current.status).toBe('success')
  })

  it('surfaces a typed error and rethrows when a mutation fails', async () => {
    submitArtwork.mockRejectedValueOnce({ code: 'permission-denied', message: 'You do not have permission to do that.' })
    const { result } = renderHook(() => useUpdateArtwork())

    await act(async () => {
      await expect(result.current.submit('a1')).rejects.toBeTruthy()
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error?.message).toBe('You do not have permission to do that.')
  })
})
