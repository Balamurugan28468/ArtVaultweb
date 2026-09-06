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
