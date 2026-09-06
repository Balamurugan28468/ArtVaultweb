import { describe, expect, it, vi } from 'vitest'

const { deleteObject, getDownloadURL, ref, uploadBytesResumable } = vi.hoisted(() => ({
  deleteObject: vi.fn(),
  getDownloadURL: vi.fn(),
  ref: vi.fn((_storage: unknown, path: string) => ({ path })),
  uploadBytesResumable: vi.fn(),
}))

vi.mock('firebase/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/storage')>()
  return { ...actual, deleteObject, getDownloadURL, ref, uploadBytesResumable }
})
vi.mock('@/lib/firebase/config', () => ({ storage: {} }))

const {
  artworkImagePath,
  deleteArtworkImageObject,
  getArtworkImageDownloadURL,
  newArtworkImageId,
  startArtworkImageUpload,
  validateImageFile,
} = await import('./artworkImageStorage')

function makeFile(name: string, size: number, type: string): File {
  const file = new File([new Uint8Array(Math.max(size, 0))], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('validateImageFile', () => {
  it('accepts a supported, reasonably-sized JPEG', () => {
    expect(validateImageFile(makeFile('a.jpg', 1024, 'image/jpeg'))).toBeNull()
  })

  it('rejects an unsupported content type', () => {
    expect(validateImageFile(makeFile('a.gif', 1024, 'image/gif'))).toEqual({
      code: 'unsupported-type',
      message: 'Only JPEG, PNG, or WebP images are supported.',
    })
  })

  it('rejects a file over the 10 MB limit', () => {
    expect(validateImageFile(makeFile('a.jpg', 10 * 1024 * 1024 + 1, 'image/jpeg'))?.code).toBe('too-large')
  })

  it('rejects a zero-byte file', () => {
    expect(validateImageFile(makeFile('a.jpg', 0, 'image/jpeg'))?.code).toBe('empty')
  })
})

describe('artworkImagePath', () => {
  it('builds an owner-scoped path from sellerId/artworkId/imageId', () => {
    expect(artworkImagePath('alice', 'art1', 'img1.jpg')).toBe('artworks/alice/art1/img1.jpg')
  })
})

describe('newArtworkImageId', () => {
  it('produces a unique id with the extension matching the content type', () => {
    const a = newArtworkImageId('image/png')
    const b = newArtworkImageId('image/png')
    expect(a).toMatch(/\.png$/)
    expect(a).not.toBe(b)
  })
})

describe('startArtworkImageUpload', () => {
  it('starts an upload at the owner-scoped path with the file content type', () => {
    startArtworkImageUpload('alice', 'art1', 'img1.jpg', makeFile('a.jpg', 10, 'image/jpeg'))
    expect(ref).toHaveBeenCalledWith({}, 'artworks/alice/art1/img1.jpg')
    expect(uploadBytesResumable).toHaveBeenCalledWith({ path: 'artworks/alice/art1/img1.jpg' }, expect.anything(), {
      contentType: 'image/jpeg',
    })
  })
})

describe('getArtworkImageDownloadURL', () => {
  it('resolves the download URL for a given path', async () => {
    getDownloadURL.mockResolvedValueOnce('https://example.test/img1.jpg')
    await expect(getArtworkImageDownloadURL('artworks/alice/art1/img1.jpg')).resolves.toBe('https://example.test/img1.jpg')
    expect(ref).toHaveBeenCalledWith({}, 'artworks/alice/art1/img1.jpg')
  })
})

describe('deleteArtworkImageObject', () => {
  it('deletes the object at the given path', async () => {
    deleteObject.mockResolvedValueOnce(undefined)
    await deleteArtworkImageObject('artworks/alice/art1/img1.jpg')
    expect(deleteObject).toHaveBeenCalledTimes(1)
  })

  it('treats an already-missing object as success rather than throwing', async () => {
    deleteObject.mockRejectedValueOnce({ code: 'storage/object-not-found' })
    await expect(deleteArtworkImageObject('artworks/alice/art1/img1.jpg')).resolves.toBeUndefined()
  })

  it('rethrows any other error', async () => {
    deleteObject.mockRejectedValueOnce({ code: 'storage/unauthorized' })
    await expect(deleteArtworkImageObject('artworks/alice/art1/img1.jpg')).rejects.toEqual({ code: 'storage/unauthorized' })
  })
})
