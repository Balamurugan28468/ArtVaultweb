import { describe, expect, it, vi } from 'vitest'

const storage = {
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ storage: { from: () => storage } }),
}))

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
  it('builds a UUID-scoped private path from sellerId/artworkId/imageId', () => {
    expect(artworkImagePath('seller', 'artwork', 'image')).toBe('seller/artwork/image')
  })
})

describe('newArtworkImageId', () => {
  it('produces a UUID database identifier rather than a browser filename', () => {
    const a = newArtworkImageId('image/png')
    const b = newArtworkImageId('image/png')
    expect(a).toMatch(/^[0-9a-f-]{36}$/i)
    expect(a).not.toBe(b)
  })
})

describe('startArtworkImageUpload', () => {
  it('uploads private bytes with the actual content type and reports completion', async () => {
    storage.upload.mockResolvedValueOnce({ error: null })
    const progress = vi.fn()
    const complete = vi.fn()
    startArtworkImageUpload('seller', 'artwork', 'image', makeFile('a.jpg', 10, 'image/jpeg')).on(
      'state_changed', progress, undefined, complete,
    )
    await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
    expect(storage.upload).toHaveBeenCalledWith('seller/artwork/image', expect.any(File), expect.objectContaining({
      contentType: 'image/jpeg', upsert: false,
    }))
    expect(progress).toHaveBeenLastCalledWith({ bytesTransferred: 10, totalBytes: 10 })
  })
})

describe('getArtworkImageDownloadURL', () => {
  it('resolves a short-lived signed URL for a given private path', async () => {
    storage.createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: 'https://example.test/img1.jpg' }, error: null })
    await expect(getArtworkImageDownloadURL('seller/artwork/image')).resolves.toBe('https://example.test/img1.jpg')
    expect(storage.createSignedUrl).toHaveBeenCalledWith('seller/artwork/image', 300)
  })
})

describe('deleteArtworkImageObject', () => {
  it('deletes the object at the given path', async () => {
    storage.remove.mockResolvedValueOnce({ error: null })
    await deleteArtworkImageObject('seller/artwork/image')
    expect(storage.remove).toHaveBeenCalledWith(['seller/artwork/image'])
  })

  it('treats an already-missing object as success rather than throwing', async () => {
    storage.remove.mockResolvedValueOnce({ error: { statusCode: '404' } })
    await expect(deleteArtworkImageObject('seller/artwork/image')).resolves.toBeUndefined()
  })

  it('rethrows any other error', async () => {
    storage.remove.mockResolvedValueOnce({ error: { statusCode: '403' } })
    await expect(deleteArtworkImageObject('seller/artwork/image')).rejects.toEqual({ statusCode: '403' })
  })
})
