import { ImageOff, RotateCcw, X } from 'lucide-react'
import { useRef, type ChangeEvent } from 'react'
import { useArtworkImages } from '../hooks/useArtworkImages'
import { ARTWORK_IMAGE_CONTENT_TYPES, ARTWORK_MAX_IMAGES, type Artwork } from '../types'
import { Button, IconButton, Spinner } from '@/shared/ui'

/**
 * Seller-facing photo manager for one DRAFT artwork (Module 05). Rendered
 * read-only (no add/remove/reorder controls) once the artwork is SUBMITTED —
 * the same component covers both states so there is exactly one place that
 * renders an artwork's photos, rather than a separate "locked gallery"
 * duplicating this markup.
 */
export function ArtworkImageManager({ artwork }: { artwork: Artwork }) {
  const { images, pending, editable, remainingSlots, removingId, listError, addFiles, retry, dismiss, removeImage, moveImage } =
    useArtworkImages(artwork)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) addFiles(event.target.files)
    event.target.value = ''
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
                    onClick={() => void removeImage(image)}
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
    </div>
  )
}
