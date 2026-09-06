import { deleteObject, getDownloadURL, ref, uploadBytesResumable, type UploadTask } from 'firebase/storage'
import { storage } from '@/lib/firebase/config'
import { ARTWORK_MAX_IMAGE_BYTES, isArtworkImageContentType, type ArtworkImageContentType } from '../types'

const CONTENT_TYPE_EXTENSION: Record<ArtworkImageContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export interface FileValidationError {
  code: 'unsupported-type' | 'too-large' | 'empty'
  message: string
}

/** First line of feedback only — storage.rules independently re-validates every real upload. */
export function validateImageFile(file: File): FileValidationError | null {
  if (!isArtworkImageContentType(file.type)) {
    return { code: 'unsupported-type', message: 'Only JPEG, PNG, or WebP images are supported.' }
  }
  if (file.size <= 0) {
    return { code: 'empty', message: 'This file is empty.' }
  }
  if (file.size > ARTWORK_MAX_IMAGE_BYTES) {
    return { code: 'too-large', message: 'Images must be 10 MB or smaller.' }
  }
  return null
}

/** Owner-scoped, never trusts a client-supplied filename as an identifier — see storage.rules. */
export function artworkImagePath(sellerId: string, artworkId: string, imageId: string): string {
  return `artworks/${sellerId}/${artworkId}/${imageId}`
}

export function newArtworkImageId(contentType: ArtworkImageContentType): string {
  return `${crypto.randomUUID()}.${CONTENT_TYPE_EXTENSION[contentType]}`
}

export function startArtworkImageUpload(sellerId: string, artworkId: string, imageId: string, file: File): UploadTask {
  const storageRef = ref(storage, artworkImagePath(sellerId, artworkId, imageId))
  return uploadBytesResumable(storageRef, file, { contentType: file.type })
}

export function getArtworkImageDownloadURL(path: string): Promise<string> {
  return getDownloadURL(ref(storage, path))
}

function isStorageErrorLike(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error
}

/** Best-effort: a Storage object that's already gone (or never finished uploading) must not block removing its Firestore reference. */
export async function deleteArtworkImageObject(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path))
  } catch (error) {
    if (isStorageErrorLike(error) && error.code === 'storage/object-not-found') return
    throw error
  }
}
