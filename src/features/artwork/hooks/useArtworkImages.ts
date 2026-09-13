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

function sortImages(images: readonly ArtworkImage[]): ArtworkImage[] {
  return [...images].sort((a, b) => a.order - b.order)
}

/**
 * Owns the full add/upload/retry/remove/reorder lifecycle for one artwork's
 * photos. `artwork.images` (from the live Firestore subscription) is the
 * single source of truth for already-saved photos; this hook's own state is
 * only ever the transient, client-only bookkeeping for uploads in flight —
 * nothing here is trusted as authorization, matching Module 04's invariant
 * that only storage.rules/firestore.rules ever decide what's actually
 * allowed to be written.
 *
 * A DRAFT artwork's photo actions commit to Firestore immediately, one at a
 * time (via `mutateArtworkImages`) — safe because DRAFT stays DRAFT no
 * matter how its images change. A PUBLISHED or REJECTED artwork's photo
 * actions are a *material* edit (see firestore.rules' own comment on its
 * update rule): they can never land on the live document one action at a
 * time, because the very first one would flip `status` to `SUBMITTED` and
 * firestore.rules then locks the document completely — the required
 * behavior anyway ("SUBMITTED cannot mutate photos or any artwork fields").
 * So for these two statuses, every add/remove/reorder only ever changes a
 * local, staged copy (`stagedImages`) — never Firestore — until the seller
 * explicitly saves through ArtworkForm's existing confirm-and-resubmit flow,
 * which calls `getImagesForSave()`/`finalizeSave()` below to commit the
 * whole batch in the one write `resubmitArtworkForReview` already makes.
 */
export function useArtworkImages(artwork: Pick<Artwork, 'id' | 'sellerId' | 'images' | 'status'>) {
  const staged = artwork.status === 'PUBLISHED' || artwork.status === 'REJECTED'
  const editable = artwork.status === 'DRAFT' || staged

  const [pending, setPending] = useState<PendingUploadInternal[]>([])
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  // Staged mode only — `null` means "no local edits yet this session, use
  // artwork.images verbatim"; once the seller performs any staged action
  // this becomes the effective, in-progress photo list until finalizeSave()
  // (on a successful save) or an unmount (on cancel) resolves it.
  const [stagedImages, setStagedImages] = useState<ArtworkImage[] | null>(null)

  const pendingRef = useRef<PendingUploadInternal[]>([])
  useEffect(() => {
    pendingRef.current = pending
  })
  const stagedImagesRef = useRef<ArtworkImage[] | null>(null)
  useEffect(() => {
    stagedImagesRef.current = stagedImages
  })
  const artworkImagesRef = useRef<ArtworkImage[]>(artwork.images)
  useEffect(() => {
    artworkImagesRef.current = artwork.images
  })
  // Set by finalizeSave() the instant a staged save actually commits — read
  // by the unmount cleanup below instead of `artwork.images` directly,
  // because ArtworkFormPage navigates away (unmounting this hook)
  // immediately on a successful save, typically before the live
  // subscription has necessarily delivered the new document.
  const committedImagesRef = useRef<ArtworkImage[] | null>(null)

  useEffect(() => {
    return () => {
      // Cancel anything still uploading when the form is left mid-upload —
      // an abandoned upload's bytes and the Storage object it would have
      // produced are both avoidable, not just a stray background request.
      for (const upload of pendingRef.current) {
        if (upload.status === 'uploading') upload.task?.cancel()
      }
      // Staged mode: any photo the seller added this session that was never
      // actually saved (they navigated away, or just closed the tab) is an
      // orphaned Storage object nothing will ever reference — clean it up
      // rather than leaking it. Never touches an image that was already
      // part of the artwork before this session, or one this session's own
      // save just committed (committedImagesRef).
      const staged_ = stagedImagesRef.current
      if (staged_) {
        const originalIds = new Set(artworkImagesRef.current.map((image) => image.id))
        const keepIds = new Set((committedImagesRef.current ?? artworkImagesRef.current).map((image) => image.id))
        for (const image of staged_) {
          if (!originalIds.has(image.id) && !keepIds.has(image.id)) {
            void deleteArtworkImageObject(image.path).catch(() => {})
          }
        }
      }
    }
  }, [])

  const sortedOriginal = sortImages(artwork.images)
  const images = staged && stagedImages !== null ? stagedImages : sortedOriginal
  const isDirty = staged && stagedImages !== null
  const uploadingCount = pending.filter((p) => p.status === 'uploading').length
  const remainingSlots = Math.max(0, ARTWORK_MAX_IMAGES - images.length - uploadingCount)

  function baseImages(prev: ArtworkImage[] | null): ArtworkImage[] {
    return prev ?? sortedOriginal
  }

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
              const newImage: ArtworkImage = {
                id: upload.imageId,
                path: upload.path,
                url,
                order: 0,
                contentType: upload.contentType,
                size: upload.size,
              }
              if (staged) {
                setStagedImages((prev) => {
                  const base = baseImages(prev)
                  return [...base, { ...newImage, order: base.length }]
                })
              } else {
                await mutateArtworkImages(artwork.id, (current) => [...current, { ...newImage, order: current.length }])
              }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [artwork.id, artwork.sellerId, staged],
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
      if (staged) {
        setRemovingId(image.id)
        try {
          const isOriginal = artwork.images.some((img) => img.id === image.id)
          if (!isOriginal) {
            // Never referenced by any saved document — safe to delete right away.
            await deleteArtworkImageObject(image.path).catch(() => {})
          }
          setStagedImages((prev) =>
            baseImages(prev)
              .filter((img) => img.id !== image.id)
              .map((img, i) => ({ ...img, order: i })),
          )
        } finally {
          setRemovingId(null)
        }
        return
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [artwork.id, artwork.images, staged],
  )

  const moveImage = useCallback(
    async (imageId: string, direction: 'up' | 'down') => {
      setListError(null)
      if (staged) {
        setStagedImages((prev) => {
          const sorted = baseImages(prev)
          const index = sorted.findIndex((img) => img.id === imageId)
          const swapWith = direction === 'up' ? index - 1 : index + 1
          if (index === -1 || swapWith < 0 || swapWith >= sorted.length) return prev ?? sorted
          const reordered = [...sorted]
          const temp = reordered[index]!
          reordered[index] = reordered[swapWith]!
          reordered[swapWith] = temp
          return reordered.map((img, i) => ({ ...img, order: i }))
        })
        return
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [artwork.id, staged],
  )

  /** The exact, renumbered array ArtworkForm should persist on Save — staged mode only; meaningless (and unused) in DRAFT, which never batches a save. */
  const getImagesForSave = useCallback((): ArtworkImage[] => images.map((image, index) => ({ ...image, order: index })), [images])

  /**
   * Call once a staged save has actually committed `savedImages` to
   * Firestore — best-effort deletes the Storage object for any *original*
   * image the save dropped (now safely unreferenced), then clears the local
   * staging buffer since Firestore now matches it.
   */
  const finalizeSave = useCallback(
    (savedImages: ArtworkImage[]) => {
      const savedIds = new Set(savedImages.map((image) => image.id))
      for (const original of artwork.images) {
        if (!savedIds.has(original.id)) {
          void deleteArtworkImageObject(original.path).catch(() => {})
        }
      }
      committedImagesRef.current = savedImages
      setStagedImages(null)
    },
    [artwork.images],
  )

  return {
    images,
    pending: pending.map(toPublicPending),
    editable,
    staged,
    isDirty,
    remainingSlots,
    removingId,
    listError,
    addFiles,
    retry,
    dismiss,
    removeImage,
    moveImage,
    getImagesForSave,
    finalizeSave,
  }
}
