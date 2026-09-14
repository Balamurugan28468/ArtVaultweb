import { ImageOff, RotateCcw, X } from 'lucide-react'
import { forwardRef, useImperativeHandle, useRef, useState, type ChangeEvent } from 'react'
import { useArtworkImages } from '../hooks/useArtworkImages'
import { ARTWORK_IMAGE_CONTENT_TYPES, ARTWORK_MAX_IMAGES, type Artwork, type ArtworkImage } from '../types'
import { Button, IconButton, Modal, Spinner } from '@/shared/ui'

/**
 * Imperative bridge to ArtworkForm's Save flow — deliberately not props,
 * since ArtworkForm doesn't otherwise need to know anything about this
 * component's internal upload/staging state, only what to persist and when
 * it's safe to reconcile Storage afterward. Only meaningful for a PUBLISHED
 * or REJECTED artwork (`useArtworkImages`' `staged` mode); calling these for
 * a DRAFT (which commits every action immediately) is harmless but a no-op
 * in effect, since DRAFT is never `isDirty`.
 */
export interface ArtworkImageManagerHandle {
  isDirty: boolean
  getImagesForSave: () => ArtworkImage[]
  finalizeSave: (savedImages: ArtworkImage[]) => void
}

/**
 * Seller-facing photo manager for one artwork (Module 05; extended in
 * Module 13's photo-editing follow-up to also cover PUBLISHED/REJECTED as a
 * material edit — see useArtworkImages' own comment). Rendered read-only (no
 * add/remove/reorder controls) only once the artwork is SUBMITTED — the same
 * component covers every status so there is exactly one place that renders
 * an artwork's photos, rather than a separate "locked gallery" duplicating
 * this markup.
 */
export const ArtworkImageManager = forwardRef<ArtworkImageManagerHandle, { artwork: Artwork }>(function ArtworkImageManager(
  { artwork },
  ref,
) {
  const {
    images,
    pending,
    editable,
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
  } = useArtworkImages(artwork)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // UI-03 final correction — an already-saved photo (one that exists in
  // `images`, as opposed to a still-uploading/failed entry in `pending`)
  // now requires an explicit confirmation before it's actually removed;
  // clicking the X button opens this instead of calling removeImage
  // directly.
  const [confirmDeleteImage, setConfirmDeleteImage] = useState<ArtworkImage | null>(null)

  useImperativeHandle(ref, () => ({ isDirty, getImagesForSave, finalizeSave }))

  const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) addFiles(event.target.files)
    event.target.value = ''
  }

  async function handleConfirmDeleteImage() {
    if (!confirmDeleteImage) return
    const image = confirmDeleteImage
    setConfirmDeleteImage(null)
    await removeImage(image)
  }

  const hasNothing = images.length === 0 && pending.length === 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text-secondary">Photos</span>
        <span className="text-xs text-text-muted">
          {images.length + pending.filter((p) => p.status === 'uploading').length} / {ARTWORK_MAX_IMAGES}
        </span>
      </div>

      {hasNothing && !editable && (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-border-strong px-3 py-3 text-sm text-text-muted">
          <ImageOff aria-hidden="true" className="h-4 w-4 shrink-0" />
          No photos were added.
        </div>
      )}

      {(images.length > 0 || pending.length > 0) && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image, index) => (
            <li key={image.id} className="flex flex-col gap-1.5">
              <div className="relative aspect-square overflow-hidden rounded-md border border-border-on-light bg-surface-elevated">
                <img src={image.url} alt="" className="h-full w-full object-cover" />
                {editable && (
                  <IconButton
                    icon={<X className="h-4 w-4" aria-hidden="true" />}
                    label="Remove photo"
                    variant="solid"
                    className="absolute top-1.5 right-1.5 h-8 w-8"
                    disabled={removingId === image.id}
                    onClick={() => setConfirmDeleteImage(image)}
                  />
                )}
              </div>
              {editable && (
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs text-text-muted">
                    Photo {index + 1}
                    {removingId === image.id ? ' — removing…' : ''}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="text-xs font-medium text-text-secondary hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={index === 0}
                      onClick={() => void moveImage(image.id, 'up')}
                    >
                      Move earlier
                    </button>
                    <button
                      type="button"
                      className="text-xs font-medium text-text-secondary hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={index === images.length - 1}
                      onClick={() => void moveImage(image.id, 'down')}
                    >
                      Move later
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}

          {pending.map((upload) => (
            <li key={upload.localId} className="flex flex-col gap-1.5">
              <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong bg-surface-elevated p-2 text-center">
                {upload.status === 'uploading' ? (
                  <>
                    <Spinner label={`Uploading ${upload.fileName}`} />
                    <span className="text-xs text-text-muted">{upload.progress}%</span>
                  </>
                ) : (
                  <>
                    <p role="alert" className="text-xs text-danger">
                      {upload.error}
                    </p>
                    <div className="flex gap-2">
                      {upload.retryable && (
                        <IconButton
                          icon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
                          label={`Retry uploading ${upload.fileName}`}
                          onClick={() => retry(upload.localId)}
                        />
                      )}
                      <IconButton
                        icon={<X className="h-4 w-4" aria-hidden="true" />}
                        label={`Dismiss ${upload.fileName}`}
                        onClick={() => dismiss(upload.localId)}
                      />
                    </div>
                  </>
                )}
              </div>
              <span className="truncate text-xs text-text-muted" title={upload.fileName}>
                {upload.fileName}
              </span>
            </li>
          ))}
        </ul>
      )}

      {listError && (
        <p role="alert" className="text-sm text-danger">
          {listError}
        </p>
      )}

      {editable && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ARTWORK_IMAGE_CONTENT_TYPES.join(',')}
            onChange={handleFilesSelected}
            className="sr-only"
            id="artwork-photo-input"
          />
          <label htmlFor="artwork-photo-input" className="sr-only">
            Add photos
          </label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={remainingSlots <= 0}
            onClick={() => fileInputRef.current?.click()}
          >
            Add photos
          </Button>
          <p className="mt-1 text-xs text-text-muted">
            {remainingSlots <= 0
              ? `You've reached the limit of ${ARTWORK_MAX_IMAGES} photos.`
              : 'JPEG, PNG, or WebP. Up to 10 MB each.'}
          </p>
        </div>
      )}

      <Modal
        open={confirmDeleteImage !== null}
        onClose={() => setConfirmDeleteImage(null)}
        title="Remove this photo?"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirmDeleteImage(null)} disabled={removingId !== null}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirmDeleteImage()}
              disabled={removingId !== null}
              className="!bg-danger text-white hover:!bg-danger/90"
            >
              {removingId !== null ? 'Removing…' : 'Remove photo'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-secondary">This photo will be permanently removed. This action cannot be undone.</p>
      </Modal>
    </div>
  )
})
