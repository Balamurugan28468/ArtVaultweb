import { createClient } from '@/lib/supabase/client'
import { ARTWORK_MAX_IMAGE_BYTES, isArtworkImageContentType, type ArtworkImageContentType } from '../types'

export interface FileValidationError {
  code: 'unsupported-type' | 'too-large' | 'empty'
  message: string
}

export interface UploadTaskSnapshot {
  bytesTransferred: number
  totalBytes: number
}

/** Minimal compatibility contract for the existing image hook. */
export interface UploadTask {
  on(
    event: 'state_changed',
    next?: (snapshot: UploadTaskSnapshot) => void,
    error?: (error: unknown) => void,
    complete?: () => void,
  ): () => void
  cancel(): boolean
}

export function validateImageFile(file: File): FileValidationError | null {
  if (!isArtworkImageContentType(file.type)) {
    return { code: 'unsupported-type', message: 'Only JPEG, PNG, or WebP images are supported.' }
  }
  if (file.size <= 0) return { code: 'empty', message: 'This file is empty.' }
  if (file.size > ARTWORK_MAX_IMAGE_BYTES) {
    return { code: 'too-large', message: 'Images must be 10 MB or smaller.' }
  }
  return null
}

/** Matches the private bucket policy: seller UUID / artwork UUID / image UUID. */
export function artworkImagePath(sellerId: string, artworkId: string, imageId: string): string {
  return `${sellerId}/${artworkId}/${imageId}`
}

/** PostgreSQL image identifiers are UUIDs, not browser-controlled file names. */
export function newArtworkImageId(_contentType: ArtworkImageContentType): string {
  return crypto.randomUUID()
}

class SupabaseUploadTask implements UploadTask {
  private cancelled = false
  private started = false
  private readonly path: string
  private readonly file: File
  private listeners = new Set<{
    next?: (snapshot: UploadTaskSnapshot) => void
    error?: (error: unknown) => void
    complete?: () => void
  }>()

  constructor(path: string, file: File) {
    this.path = path
    this.file = file
  }

  on(
    event: 'state_changed',
    next?: (snapshot: UploadTaskSnapshot) => void,
    error?: (error: unknown) => void,
    complete?: () => void,
  ) {
    if (event !== 'state_changed') return () => {}
    const listener = { next, error, complete }
    this.listeners.add(listener)
    this.start()
    return () => this.listeners.delete(listener)
  }

  cancel(): boolean {
    if (this.cancelled) return false
    this.cancelled = true
    return true
  }

  private emitProgress(bytesTransferred: number) {
    for (const listener of this.listeners) listener.next?.({ bytesTransferred, totalBytes: this.file.size })
  }

  private start() {
    if (this.started) return
    this.started = true
    queueMicrotask(() => void this.upload())
  }

  private async upload() {
    if (this.cancelled) return
    this.emitProgress(0)
    const storage = createClient().storage.from('artwork-images')
    const { error } = await storage.upload(this.path, this.file, {
      contentType: this.file.type,
      cacheControl: '3600',
      upsert: false,
    })
    if (this.cancelled) {
      if (!error) await storage.remove([this.path])
      return
    }
    if (error) {
      for (const listener of this.listeners) listener.error?.(error)
      return
    }
    this.emitProgress(this.file.size)
    for (const listener of this.listeners) listener.complete?.()
  }
}

export function startArtworkImageUpload(
  sellerId: string,
  artworkId: string,
  imageId: string,
  file: File,
): UploadTask {
  return new SupabaseUploadTask(artworkImagePath(sellerId, artworkId, imageId), file)
}

export async function getArtworkImageDownloadURL(path: string): Promise<string> {
  const { data, error } = await createClient().storage.from('artwork-images').createSignedUrl(path, 300)
  if (error || !data?.signedUrl) throw error ?? new Error('Could not create image URL.')
  return data.signedUrl
}

/** Missing objects are already absent from the desired final state. */
export async function deleteArtworkImageObject(path: string): Promise<void> {
  const { error } = await createClient().storage.from('artwork-images').remove([path])
  if (error && error.statusCode !== '404') throw error
}
