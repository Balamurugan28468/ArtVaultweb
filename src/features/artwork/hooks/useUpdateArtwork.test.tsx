import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUpdateArtwork } from './useUpdateArtwork'
import type { ArtworkImage } from '../types'

const updateArtworkDraft = vi.fn()
const submitArtwork = vi.fn()
const deleteArtworkDraft = vi.fn()
vi.mock('../api/artworkRepository', () => ({
  updateArtworkDraft: (...args: unknown[]) => updateArtworkDraft(...args),
  submitArtwork: (...args: unknown[]) => submitArtwork(...args),
  deleteArtworkDraft: (...args: unknown[]) => deleteArtworkDraft(...args),
}))

const deleteArtworkImageObject = vi.fn()
vi.mock('../api/artworkImageStorage', () => ({
  deleteArtworkImageObject: (...args: unknown[]) => deleteArtworkImageObject(...args),
}))

beforeEach(() => {
  updateArtworkDraft.mockReset()
  submitArtwork.mockReset()
  deleteArtworkDraft.mockReset()
  deleteArtworkImageObject.mockReset().mockResolvedValue(undefined)
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
    expect(deleteArtworkImageObject).not.toHaveBeenCalled()
    expect(result.current.status).toBe('success')
  })

  it("remove() best-effort deletes each of the draft's images before deleting the document", async () => {
    deleteArtworkDraft.mockResolvedValueOnce(undefined)
    const images: ArtworkImage[] = [
      { id: 'a', path: 'artworks/alice/a1/a.jpg', url: 'u', order: 0, contentType: 'image/jpeg', size: 1 },
      { id: 'b', path: 'artworks/alice/a1/b.jpg', url: 'u', order: 1, contentType: 'image/jpeg', size: 1 },
    ]
    const { result } = renderHook(() => useUpdateArtwork())

    await act(async () => {
      await result.current.remove('a1', images)
    })

    expect(deleteArtworkImageObject).toHaveBeenCalledWith('artworks/alice/a1/a.jpg')
    expect(deleteArtworkImageObject).toHaveBeenCalledWith('artworks/alice/a1/b.jpg')
    expect(deleteArtworkDraft).toHaveBeenCalledWith('a1')
  })

  it('remove() still deletes the document even when an image Storage delete fails', async () => {
    deleteArtworkDraft.mockResolvedValueOnce(undefined)
    deleteArtworkImageObject.mockRejectedValueOnce(new Error('storage/unauthorized'))
    const images: ArtworkImage[] = [{ id: 'a', path: 'artworks/alice/a1/a.jpg', url: 'u', order: 0, contentType: 'image/jpeg', size: 1 }]
    const { result } = renderHook(() => useUpdateArtwork())

    await act(async () => {
      await result.current.remove('a1', images)
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
