import { ImageOff } from 'lucide-react'
import { useMemo, useState, type KeyboardEvent } from 'react'
import type { ArtworkImage } from '../types'

/**
 * The Artwork Detail page's own image viewer (Module 11) — deliberately a
 * different presentation from `PublicArtworkCard`'s cover thumbnail: a card
 * crops to a square (`object-cover`, right for a small grid tile) but this
 * is the artwork's own dedicated viewing surface, so the primary image uses
 * `object-contain` inside a bounded, fixed-height frame — every real
 * portrait or landscape artwork is shown at its true proportions, never
 * cropped, and the frame's own fixed height means switching images never
 * shifts the surrounding page layout.
 *
 * Selection is plain component state driven only by explicit user action
 * (a thumbnail click/Enter/Space, or an arrow key) — there is no timer,
 * no autoplay, and no transition beyond the existing motion-safe fade the
 * rest of the app already uses elsewhere.
 */
export function ArtworkGallery({ images, title }: { images: ArtworkImage[]; title: string }) {
  const sorted = useMemo(() => [...images].sort((a, b) => a.order - b.order), [images])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set())

  const safeIndex = Math.min(selectedIndex, Math.max(sorted.length - 1, 0))
  const current = sorted[safeIndex]
  const currentFailed = current ? failedIds.has(current.id) : false
  const showPrimaryImage = Boolean(current) && !currentFailed

  function select(index: number) {
    setSelectedIndex(Math.max(0, Math.min(index, sorted.length - 1)))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (sorted.length < 2) return
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      select(safeIndex + 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      select(safeIndex - 1)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label={sorted.length > 1 ? `Image ${safeIndex + 1} of ${sorted.length} for ${title}` : `Image of ${title}`}
        aria-roledescription={sorted.length > 1 ? 'image gallery' : undefined}
        tabIndex={sorted.length > 1 ? 0 : -1}
        onKeyDown={handleKeyDown}
        className="flex min-h-[18rem] items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-elevated sm:min-h-[24rem] lg:min-h-[28rem] xl:min-h-[30rem]"
      >
        {showPrimaryImage ? (
          <img
            key={current.id}
            src={current.url}
            alt={title}
            className="max-h-[18rem] max-w-full object-contain sm:max-h-[24rem] lg:max-h-[28rem] xl:max-h-[30rem]"
            onError={() => setFailedIds((prev) => new Set(prev).add(current.id))}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-text-muted">
            <ImageOff aria-hidden="true" className="h-10 w-10" />
            <span className="text-sm">No image available</span>
          </div>
        )}
      </div>

      {sorted.length > 1 && (
        <div role="tablist" aria-label={`${title} thumbnails`} className="flex flex-wrap gap-2">
          {sorted.map((image, index) => (
            <button
              key={image.id}
              type="button"
              role="tab"
              aria-selected={index === safeIndex}
              aria-label={`View image ${index + 1} of ${sorted.length}`}
              onClick={() => select(index)}
              className={`h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 transition-colors duration-150 ease-standard sm:h-16 sm:w-16 ${
                index === safeIndex ? 'border-brand-primary' : 'border-border hover:border-border-strong'
              }`}
            >
              {failedIds.has(image.id) ? (
                <span className="flex h-full w-full items-center justify-center bg-surface-elevated">
                  <ImageOff aria-hidden="true" className="h-4 w-4 text-text-muted" />
                </span>
              ) : (
                <img
                  src={image.url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                  onError={() => setFailedIds((prev) => new Set(prev).add(image.id))}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
