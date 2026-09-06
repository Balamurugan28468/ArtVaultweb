import { useCallback, useEffect, useRef, useState } from 'react'
import {
  artworkImagePath,
  deleteArtworkImageObject,
  getArtworkImageDownloadURL,
  newArtworkImageId,
  startArtworkImageUpload,
  validateImageFile,
} from '../api/artworkImageStorage'
import { mutateArtworkImages } from '../api/artworkRepository'
import { ARTWORK_MAX_IMAGES, isArtworkError, type Artwork, type ArtworkImage, type ArtworkImageContentType } from '../types'

function errorMessage(err: unknown, fallback: string): string {
  return isArtworkError(err) ? err.message : err instanceof Error ? err.message : fallback
}

export interface PendingArtworkImage {
  localId: string
  fileName: string
  progress: number
  status: 'uploading' | 'failed'
  error: string | null
  /** Validation failures (wrong type/too large) can't succeed on retry — only a real upload/save failure can. */
  retryable: boolean
}

interface PendingUploadInternal extends PendingArtworkImage {
  signature: string
  imageId: string
  path: string
  contentType: ArtworkImageContentType
  size: number
  file: File
  task: ReturnType<typeof startArtworkImageUpload> | null
}

function fileSignature(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function toPublicPending(upload: PendingUploadInternal): PendingArtworkImage {
  const { localId, fileName, progress, status, error, retryable } = upload
  return { localId, fileName, progress, status, error, retryable }
}

/**
 * Owns the full add/upload/retry/remove/reorder lifecycle for one artwork's
 * photos. `artwork.images` (from the live Firestore subscription) is the
 * single source of truth for already-saved photos; this hook's own state is
 * only ever the transient, client-only bookkeeping for uploads in flight —
 * nothing here is trusted as authorization, matching Module 04's invariant
 * that only storage.rules/firestore.rules ever decide what's actually
 * allowed to be written.
 */
export function useArtworkImages(artwork: Pick<Artwork, 'id' | 'sellerId' | 'images' | 'status'>) {
  const [pending, setPending] = useState<PendingUploadInternal[]>([])
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const pendingRef = useRef<PendingUploadInternal[]>([])
  useEffect(() => {
    pendingRef.current = pending
  })

  useEffect(() => {
    return () => {
      // Cancel anything still uploading when the form is left mid-upload —
      // an abandoned upload's bytes and the Storage object it would have
      // produced are both avoidable, not just a stray background request.
      for (const upload of pendingRef.current) {
        if (upload.status === 'uploading') upload.task?.cancel()
      }
    }
  }, [])

  const images = [...artwork.images].sort((a, b) => a.order - b.order)
  const editable = artwork.status === 'DRAFT'
  const uploadingCount = pending.filter((p) => p.status === 'uploading').length
  const remainingSlots = Math.max(0, ARTWORK_MAX_IMAGES - images.length - uploadingCount)

  const runUpload = useCallback(
    (upload: PendingUploadInternal) => {
      const task = startArtworkImageUpload(artwork.sellerId, artwork.id, upload.imageId, upload.file)
      setPending((prev) =>
        prev.map((p) => (p.localId === upload.localId ? { ...p, task, status: 'uploading', progress: 0, error: null } : p)),
      )

      task.on(
        'state_changed',
        (snapshot) => {
          const progress = snapshot.totalBytes > 0 ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0
          setPending((prev) => prev.map((p) => (p.localId === upload.localId ? { ...p, progress } : p)))
        },
        (error: unknown) => {
          const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
          if (code === 'storage/canceled') {
            setPending((prev) => prev.filter((p) => p.localId !== upload.localId))
            return
          }
          setPending((prev) =>
            prev.map((p) =>
              p.localId === upload.localId ? { ...p, status: 'failed', error: 'Upload failed. Try again.', retryable: true } : p,
            ),
          )
        },
        () => {
          void (async () => {
            try {
              const url = await getArtworkImageDownloadURL(upload.path)
              await mutateArtworkImages(artwork.id, (current) => [
                ...current,
                { id: upload.imageId, path: upload.path, url, order: current.length, contentType: upload.contentType, size: upload.size },
              ])
              setPending((prev) => prev.filter((p) => p.localId !== upload.localId))
            } catch (err) {
              await deleteArtworkImageObject(upload.path).catch(() => {})
              setPending((prev) =>
                prev.map((p) =>
                  p.localId === upload.localId
                    ? {
                        ...p,
                        status: 'failed',
                        error: errorMessage(err, 'Could not save this photo. Try again.'),
                        retryable: true,
                      }
                    : p,
                ),
              )
            }
          })()
        },
      )
    },
    [artwork.id, artwork.sellerId],
  )

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      if (!editable) return
      setListError(null)
      const list = Array.from(files)
      let availableSlots = remainingSlots
      const additions: PendingUploadInternal[] = []

      for (const file of list) {
        const signature = fileSignature(file)
        // Only guards against re-queueing a file already in flight/failed —
        // whether from an earlier call or earlier in this same file list —
        // in this same session. A file legitimately removed earlier must
        // still be re-addable, so nothing here is remembered permanently.
        if (pendingRef.current.some((p) => p.signature === signature)) continue
        if (additions.some((a) => a.signature === signature)) continue

        const validationError = validateImageFile(file)
        if (validationError) {
          additions.push({
            localId: crypto.randomUUID(),
            fileName: file.name,
            progress: 0,
            status: 'failed',
            error: validationError.message,
            retryable: false,
            signature,
            imageId: '',
            path: '',
            contentType: 'image/jpeg',
            size: file.size,
            file,
            task: null,
          })
          continue
        }

        if (availableSlots <= 0) {
          setListError(`You can add up to ${ARTWORK_MAX_IMAGES} photos per artwork.`)
          break
        }

        const contentType = file.type as ArtworkImageContentType
        const imageId = newArtworkImageId(contentType)
        const path = artworkImagePath(artwork.sellerId, artwork.id, imageId)
        availableSlots -= 1
        additions.push({
          localId: crypto.randomUUID(),
          fileName: file.name,
          progress: 0,
          status: 'uploading',
          error: null,
          retryable: true,
          signature,
          imageId,
          path,
          contentType,
          size: file.size,
          file,
          task: null,
        })
      }

      if (additions.length === 0) return
      setPending((prev) => [...prev, ...additions])
      for (const addition of additions) {
        if (addition.status === 'uploading') runUpload(addition)
      }
    },
    [artwork.id, artwork.sellerId, editable, remainingSlots, runUpload],
  )

  const retry = useCallback(
    (localId: string) => {
      const upload = pendingRef.current.find((p) => p.localId === localId)
      if (!upload || !upload.retryable) return
      runUpload(upload)
    },
    [runUpload],
  )

  const dismiss = useCallback((localId: string) => {
    const upload = pendingRef.current.find((p) => p.localId === localId)
    if (upload?.status === 'uploading') upload.task?.cancel()
    setPending((prev) => prev.filter((p) => p.localId !== localId))
  }, [])

  const removeImage = useCallback(
    async (image: ArtworkImage) => {
      setListError(null)
      setRemovingId(image.id)
      try {
        await mutateArtworkImages(artwork.id, (current) => current.filter((img) => img.id !== image.id))
        await deleteArtworkImageObject(image.path).catch(() => {})
      } catch (err) {
        setListError(errorMessage(err, 'Could not remove this photo. Try again.'))
      } finally {
        setRemovingId(null)
      }
    },
    [artwork.id],
  )

  const moveImage = useCallback(
    async (imageId: string, direction: 'up' | 'down') => {
      setListError(null)
      try {
        await mutateArtworkImages(artwork.id, (current) => {
          const sorted = [...current].sort((a, b) => a.order - b.order)
          const index = sorted.findIndex((img) => img.id === imageId)
          const swapWith = direction === 'up' ? index - 1 : index + 1
          if (index === -1 || swapWith < 0 || swapWith >= sorted.length) return current
          const reordered = [...sorted]
          const temp = reordered[index]!
          reordered[index] = reordered[swapWith]!
          reordered[swapWith] = temp
          return reordered.map((img, i) => ({ ...img, order: i }))
        })
      } catch (err) {
        setListError(errorMessage(err, 'Could not reorder photos. Try again.'))
      }
    },
    [artwork.id],
  )

  return {
    images,
    pending: pending.map(toPublicPending),
    editable,
    remainingSlots,
    removingId,
    listError,
    addFiles,
    retry,
    dismiss,
    removeImage,
    moveImage,
  }
}
