import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useArtworkImages } from './useArtworkImages'
import type { FileValidationError } from '../api/artworkImageStorage'
import type { Artwork, ArtworkImage } from '../types'

type SnapshotCallback = (snapshot: { bytesTransferred: number; totalBytes: number }) => void
type ErrorCallback = (error: unknown) => void
type CompleteCallback = () => void

class FakeUploadTask {
  cancel = vi.fn(() => this.errorCb?.({ code: 'storage/canceled' }))
  private snapshotCb: SnapshotCallback | null = null
  private errorCb: ErrorCallback | null = null
  private completeCb: CompleteCallback | null = null

  on(_event: 'state_changed', snapshotCb: SnapshotCallback, errorCb: ErrorCallback, completeCb: CompleteCallback) {
    this.snapshotCb = snapshotCb
    this.errorCb = errorCb
    this.completeCb = completeCb
  }

  emitProgress(bytesTransferred: number, totalBytes: number) {
    this.snapshotCb?.({ bytesTransferred, totalBytes })
  }

  emitError(error: unknown) {
    this.errorCb?.(error)
  }

  emitComplete() {
    this.completeCb?.()
  }
}

const {
  artworkImagePath,
  deleteArtworkImageObject,
  getArtworkImageDownloadURL,
  newArtworkImageId,
  startArtworkImageUpload,
  validateImageFile,
} = vi.hoisted(() => ({
  artworkImagePath: vi.fn((sellerId: string, artworkId: string, imageId: string) => `artworks/${sellerId}/${artworkId}/${imageId}`),
  deleteArtworkImageObject: vi.fn().mockResolvedValue(undefined),
  getArtworkImageDownloadURL: vi.fn().mockResolvedValue('https://example.test/img.jpg'),
  newArtworkImageId: vi.fn(() => 'generated.jpg'),
  startArtworkImageUpload: vi.fn(),
  validateImageFile: vi.fn((): FileValidationError | null => null),
}))

vi.mock('../api/artworkImageStorage', () => ({
  artworkImagePath,
  deleteArtworkImageObject,
  getArtworkImageDownloadURL,
  newArtworkImageId,
  startArtworkImageUpload,
  validateImageFile,
}))

const mutateArtworkImages = vi.fn()
vi.mock('../api/artworkRepository', () => ({ mutateArtworkImages: (...args: unknown[]) => mutateArtworkImages(...args) }))

function makeFile(name = 'a.jpg', type = 'image/jpeg', size = 1024): File {
  const file = new File([new Uint8Array(size)], name, { type })
  return file
}

function baseArtwork(overrides: Partial<Pick<Artwork, 'images' | 'status'>> = {}): Pick<Artwork, 'id' | 'sellerId' | 'images' | 'status'> {
  return { id: 'a1', sellerId: 'alice', images: [], status: 'DRAFT', ...overrides }
}

beforeEach(() => {
  deleteArtworkImageObject.mockClear().mockResolvedValue(undefined)
  getArtworkImageDownloadURL.mockClear().mockResolvedValue('https://example.test/img.jpg')
  newArtworkImageId.mockClear().mockReturnValue('generated.jpg')
  startArtworkImageUpload.mockReset()
  validateImageFile.mockClear().mockReturnValue(null)
  mutateArtworkImages.mockReset().mockImplementation(async (_id: string, updater: (images: ArtworkImage[]) => ArtworkImage[]) => updater([]))
})

describe('useArtworkImages — adding files', () => {
  it('rejects an invalid file without starting an upload', () => {
    validateImageFile.mockReturnValueOnce({ code: 'unsupported-type', message: 'Only JPEG, PNG, or WebP images are supported.' })
    const { result } = renderHook(() => useArtworkImages(baseArtwork()))

    act(() => result.current.addFiles([makeFile('a.gif', 'image/gif')]))

    expect(result.current.pending).toHaveLength(1)
    expect(result.current.pending[0]).toMatchObject({
      status: 'failed',
      retryable: false,
      error: 'Only JPEG, PNG, or WebP images are supported.',
    })
    expect(startArtworkImageUpload).not.toHaveBeenCalled()
  })

  it('starts an upload for a valid file and tracks progress', () => {
    const task = new FakeUploadTask()
    startArtworkImageUpload.mockReturnValueOnce(task)
    const { result } = renderHook(() => useArtworkImages(baseArtwork()))

    act(() => result.current.addFiles([makeFile()]))
    expect(result.current.pending).toHaveLength(1)
    expect(result.current.pending[0]).toMatchObject({ status: 'uploading', progress: 0 })

    act(() => task.emitProgress(50, 100))
    expect(result.current.pending[0]?.progress).toBe(50)
  })

  it('saves the image via mutateArtworkImages and clears pending once the upload completes', async () => {
    const task = new FakeUploadTask()
    startArtworkImageUpload.mockReturnValueOnce(task)
    const { result } = renderHook(() => useArtworkImages(baseArtwork()))

    act(() => result.current.addFiles([makeFile()]))
    act(() => task.emitComplete())

    await waitFor(() => expect(result.current.pending).toHaveLength(0))
    expect(mutateArtworkImages).toHaveBeenCalledWith('a1', expect.any(Function))
  })

  it('marks the upload failed (retryable) when the Storage upload itself errors', () => {
    const task = new FakeUploadTask()
    startArtworkImageUpload.mockReturnValueOnce(task)
    const { result } = renderHook(() => useArtworkImages(baseArtwork()))

    act(() => result.current.addFiles([makeFile()]))
    act(() => task.emitError({ code: 'storage/unknown' }))

    expect(result.current.pending[0]).toMatchObject({ status: 'failed', retryable: true })
  })

  it('removes the pending entry (without marking it failed) when the upload is canceled', () => {
    const task = new FakeUploadTask()
    startArtworkImageUpload.mockReturnValueOnce(task)
    const { result } = renderHook(() => useArtworkImages(baseArtwork()))

    act(() => result.current.addFiles([makeFile()]))
    act(() => task.emitError({ code: 'storage/canceled' }))

    expect(result.current.pending).toHaveLength(0)
  })

  it('marks failed (retryable) when saving to Firestore fails after a successful upload, and deletes the orphaned object', async () => {
    const task = new FakeUploadTask()
    startArtworkImageUpload.mockReturnValueOnce(task)
    mutateArtworkImages.mockRejectedValueOnce({ code: 'permission-denied', message: 'This artwork can no longer be edited.' })
    const { result } = renderHook(() => useArtworkImages(baseArtwork()))

    act(() => result.current.addFiles([makeFile()]))
    act(() => task.emitComplete())

    await waitFor(() => expect(result.current.pending[0]?.status).toBe('failed'))
    expect(result.current.pending[0]?.error).toBe('This artwork can no longer be edited.')
    expect(deleteArtworkImageObject).toHaveBeenCalledWith('artworks/alice/a1/generated.jpg')
  })

  it('refuses to add files once the artwork is no longer editable (SUBMITTED)', () => {
    const { result } = renderHook(() => useArtworkImages(baseArtwork({ status: 'SUBMITTED' })))
    act(() => result.current.addFiles([makeFile()]))
    expect(result.current.pending).toHaveLength(0)
    expect(startArtworkImageUpload).not.toHaveBeenCalled()
  })

  it('blocks adding more once the per-artwork maximum is reached, without dropping the earlier ones', () => {
    const existing: ArtworkImage[] = Array.from({ length: 6 }, (_, i) => ({
      id: `img${i}.jpg`,
      path: `artworks/alice/a1/img${i}.jpg`,
      url: 'https://example.test/x.jpg',
      order: i,
      contentType: 'image/jpeg',
      size: 100,
    }))
    const { result } = renderHook(() => useArtworkImages(baseArtwork({ images: existing })))

    act(() => result.current.addFiles([makeFile('seventh.jpg')]))

    expect(result.current.listError).toBe('You can add up to 6 photos per artwork.')
    expect(startArtworkImageUpload).not.toHaveBeenCalled()
  })

  it('ignores an exact duplicate file already in flight rather than queuing it twice', () => {
    const task = new FakeUploadTask()
    startArtworkImageUpload.mockReturnValueOnce(task)
    const { result } = renderHook(() => useArtworkImages(baseArtwork()))
    const file = makeFile('same.jpg')

    act(() => result.current.addFiles([file]))
    act(() => result.current.addFiles([file]))

    expect(result.current.pending).toHaveLength(1)
    expect(startArtworkImageUpload).toHaveBeenCalledTimes(1)
  })
})

describe('useArtworkImages — retry and dismiss', () => {
  it('retry() re-runs the upload for a retryable failed entry', () => {
    const firstTask = new FakeUploadTask()
    startArtworkImageUpload.mockReturnValueOnce(firstTask)
    const { result } = renderHook(() => useArtworkImages(baseArtwork()))

    act(() => result.current.addFiles([makeFile()]))
    act(() => firstTask.emitError({ code: 'storage/unknown' }))
    const localId = result.current.pending[0]!.localId

    const secondTask = new FakeUploadTask()
    startArtworkImageUpload.mockReturnValueOnce(secondTask)
    act(() => result.current.retry(localId))

    expect(result.current.pending[0]).toMatchObject({ status: 'uploading' })
    expect(startArtworkImageUpload).toHaveBeenCalledTimes(2)
  })

  it('retry() does nothing for a non-retryable validation failure', () => {
    validateImageFile.mockReturnValueOnce({ code: 'too-large', message: 'Images must be 10 MB or smaller.' })
    const { result } = renderHook(() => useArtworkImages(baseArtwork()))

    act(() => result.current.addFiles([makeFile()]))
    const localId = result.current.pending[0]!.localId
    act(() => result.current.retry(localId))

    expect(startArtworkImageUpload).not.toHaveBeenCalled()
  })

  it('dismiss() cancels an in-flight upload and removes it from the pending list', () => {
    const task = new FakeUploadTask()
    startArtworkImageUpload.mockReturnValueOnce(task)
    const { result } = renderHook(() => useArtworkImages(baseArtwork()))

    act(() => result.current.addFiles([makeFile()]))
    const localId = result.current.pending[0]!.localId
    act(() => result.current.dismiss(localId))

    expect(task.cancel).toHaveBeenCalledTimes(1)
    expect(result.current.pending).toHaveLength(0)
  })
})

describe('useArtworkImages — removeImage', () => {
  it('removes the image from Firestore and best-effort deletes the Storage object', async () => {
    const image: ArtworkImage = {
      id: 'img1.jpg',
      path: 'artworks/alice/a1/img1.jpg',
      url: 'https://example.test/img1.jpg',
      order: 0,
      contentType: 'image/jpeg',
      size: 100,
    }
    const { result } = renderHook(() => useArtworkImages(baseArtwork({ images: [image] })))

    await act(async () => {
      await result.current.removeImage(image)
    })

    expect(mutateArtworkImages).toHaveBeenCalledWith('a1', expect.any(Function))
    expect(deleteArtworkImageObject).toHaveBeenCalledWith('artworks/alice/a1/img1.jpg')
  })
})

describe('useArtworkImages — moveImage', () => {
  it('swaps the order of the two images and renumbers them densely', async () => {
    const first: ArtworkImage = { id: 'a', path: 'p/a', url: 'u', order: 0, contentType: 'image/jpeg', size: 1 }
    const second: ArtworkImage = { id: 'b', path: 'p/b', url: 'u', order: 1, contentType: 'image/jpeg', size: 1 }
    let captured: ArtworkImage[] = []
    mutateArtworkImages.mockImplementationOnce(async (_id: string, updater: (images: ArtworkImage[]) => ArtworkImage[]) => {
      captured = updater([first, second])
      return captured
    })
    const { result } = renderHook(() => useArtworkImages(baseArtwork({ images: [first, second] })))

    await act(async () => {
      await result.current.moveImage('b', 'up')
    })

    expect(captured.map((img) => img.id)).toEqual(['b', 'a'])
    expect(captured.map((img) => img.order)).toEqual([0, 1])
  })
})

// Module 13's photo-editing follow-up: PUBLISHED/REJECTED never commit an
// image action to Firestore immediately (the first one would flip status to
// SUBMITTED and lock the document, per firestore.rules — see the required
// "SUBMITTED cannot mutate photos" test elsewhere). Every action instead
// stages locally until ArtworkForm's Save actually persists the batch via
// getImagesForSave()/finalizeSave(). SUSPENDED joins this same group as of
// the seller artwork recovery/control pass (UI-03 final correction) — an
// admin-suspended artwork's owner may now also correct its photos before
// resubmitting for review, exactly like a REJECTED one.
describe.each(['PUBLISHED', 'REJECTED', 'SUSPENDED'] as const)('useArtworkImages — %s (staged material edit)', (status) => {
  it('is editable, unlike SUBMITTED', () => {
    const { result } = renderHook(() => useArtworkImages(baseArtwork({ status })))
    expect(result.current.editable).toBe(true)
    expect(result.current.staged).toBe(true)
    expect(result.current.isDirty).toBe(false)
  })

  it('adding a photo stages it locally without ever calling mutateArtworkImages', async () => {
    const task = new FakeUploadTask()
    startArtworkImageUpload.mockReturnValueOnce(task)
    const { result } = renderHook(() => useArtworkImages(baseArtwork({ status })))

    act(() => result.current.addFiles([makeFile()]))
    await act(async () => task.emitComplete())

    await waitFor(() => expect(result.current.pending).toHaveLength(0))
    expect(mutateArtworkImages).not.toHaveBeenCalled()
    expect(result.current.images).toHaveLength(1)
    expect(result.current.isDirty).toBe(true)
  })

  it('removing a pre-existing image stages the removal without deleting its Storage object yet', async () => {
    const existing: ArtworkImage = { id: 'orig.jpg', path: 'artworks/alice/a1/orig.jpg', url: 'u', order: 0, contentType: 'image/jpeg', size: 1 }
    const { result } = renderHook(() => useArtworkImages(baseArtwork({ status, images: [existing] })))

    await act(async () => {
      await result.current.removeImage(existing)
    })

    expect(result.current.images).toHaveLength(0)
    expect(mutateArtworkImages).not.toHaveBeenCalled()
    expect(deleteArtworkImageObject).not.toHaveBeenCalled()
  })

  it('removing a photo added this same session deletes its Storage object immediately — nothing will ever reference it', async () => {
    const task = new FakeUploadTask()
    startArtworkImageUpload.mockReturnValueOnce(task)
    const { result } = renderHook(() => useArtworkImages(baseArtwork({ status })))

    act(() => result.current.addFiles([makeFile()]))
    await act(async () => task.emitComplete())
    await waitFor(() => expect(result.current.images).toHaveLength(1))
    const added = result.current.images[0]!

    await act(async () => {
      await result.current.removeImage(added)
    })

    expect(deleteArtworkImageObject).toHaveBeenCalledWith('artworks/alice/a1/generated.jpg')
    expect(result.current.images).toHaveLength(0)
  })

  it('moveImage reorders the staged copy locally without calling mutateArtworkImages', async () => {
    const first: ArtworkImage = { id: 'a', path: 'p/a', url: 'u', order: 0, contentType: 'image/jpeg', size: 1 }
    const second: ArtworkImage = { id: 'b', path: 'p/b', url: 'u', order: 1, contentType: 'image/jpeg', size: 1 }
    const { result } = renderHook(() => useArtworkImages(baseArtwork({ status, images: [first, second] })))

    await act(async () => {
      await result.current.moveImage('b', 'up')
    })

    expect(result.current.images.map((img) => img.id)).toEqual(['b', 'a'])
    expect(mutateArtworkImages).not.toHaveBeenCalled()
  })

  it('getImagesForSave() returns the staged array, densely renumbered', async () => {
    const existing: ArtworkImage = { id: 'orig.jpg', path: 'artworks/alice/a1/orig.jpg', url: 'u', order: 0, contentType: 'image/jpeg', size: 1 }
    const task = new FakeUploadTask()
    startArtworkImageUpload.mockReturnValueOnce(task)
    const { result } = renderHook(() => useArtworkImages(baseArtwork({ status, images: [existing] })))

    act(() => result.current.addFiles([makeFile()]))
    await act(async () => task.emitComplete())
    await waitFor(() => expect(result.current.images).toHaveLength(2))

    const forSave = result.current.getImagesForSave()
    expect(forSave.map((img) => img.id)).toEqual(['orig.jpg', 'generated.jpg'])
    expect(forSave.map((img) => img.order)).toEqual([0, 1])
  })

  it('finalizeSave() deletes the Storage object for any original image the save dropped, and clears the staged buffer', async () => {
    const keep: ArtworkImage = { id: 'keep.jpg', path: 'artworks/alice/a1/keep.jpg', url: 'u', order: 0, contentType: 'image/jpeg', size: 1 }
    const dropped: ArtworkImage = { id: 'dropped.jpg', path: 'artworks/alice/a1/dropped.jpg', url: 'u', order: 1, contentType: 'image/jpeg', size: 1 }
    const { result } = renderHook(() => useArtworkImages(baseArtwork({ status, images: [keep, dropped] })))

    await act(async () => {
      await result.current.removeImage(dropped)
    })
    expect(deleteArtworkImageObject).not.toHaveBeenCalled()

    act(() => result.current.finalizeSave([keep]))

    expect(deleteArtworkImageObject).toHaveBeenCalledWith('artworks/alice/a1/dropped.jpg')
    expect(result.current.isDirty).toBe(false)
  })

  it('never mutates existing images on the server — cancelling (unmounting without finalizeSave) leaves them untouched, but cleans up an orphaned new upload', async () => {
    const existing: ArtworkImage = { id: 'orig.jpg', path: 'artworks/alice/a1/orig.jpg', url: 'u', order: 0, contentType: 'image/jpeg', size: 1 }
    const task = new FakeUploadTask()
    startArtworkImageUpload.mockReturnValueOnce(task)
    const { result, unmount } = renderHook(() => useArtworkImages(baseArtwork({ status, images: [existing] })))

    act(() => result.current.addFiles([makeFile()]))
    await act(async () => task.emitComplete())
    await waitFor(() => expect(result.current.images).toHaveLength(2))

    unmount()

    // The pre-existing image was never touched (no delete for it); only the
    // uncommitted new upload — now orphaned — is cleaned up.
    expect(deleteArtworkImageObject).toHaveBeenCalledTimes(1)
    expect(deleteArtworkImageObject).toHaveBeenCalledWith('artworks/alice/a1/generated.jpg')
  })
})
