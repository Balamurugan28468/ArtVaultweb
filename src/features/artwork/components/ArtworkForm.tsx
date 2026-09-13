import { zodResolver } from '@hookform/resolvers/zod'
import { ImageOff } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { ArtworkImageManager, type ArtworkImageManagerHandle } from './ArtworkImageManager'
import { ConfirmDeleteDraftModal } from './ConfirmDeleteDraftModal'
import { ConfirmResubmitModal } from './ConfirmResubmitModal'
import { useCreateArtwork } from '../hooks/useCreateArtwork'
import { useUpdateArtwork } from '../hooks/useUpdateArtwork'
import { artworkDraftSchema, parseTags, type ArtworkDraftFormValues } from '../schemas'
import { ARTWORK_CATEGORIES, type Artwork, type ArtworkDraftInput } from '../types'
import { Badge, Button, Input, TextArea } from '@/shared/ui'

const CATEGORY_LABEL: Record<(typeof ARTWORK_CATEGORIES)[number], string> = {
  painting: 'Painting',
  sculpture: 'Sculpture',
  photography: 'Photography',
  digital: 'Digital',
  other: 'Other',
}

function toFormValues(artwork?: Artwork): ArtworkDraftFormValues {
  if (!artwork) return { title: '', description: '', price: '', category: '', tags: '', inventoryCount: '' }
  return {
    title: artwork.title,
    description: artwork.description,
    // Converted back from stored integer paise to a whole-rupee display
    // value — the only place this conversion happens besides onSubmit.
    price: String(artwork.price / 100),
    category: artwork.category,
    tags: artwork.tags.join(', '),
    inventoryCount: String(artwork.inventoryCount),
  }
}

/**
 * Module 13 Phase 4 — a PUBLISHED artwork's price/inventoryCount/tags carry
 * no content-moderation risk (see firestore.rules' own matching branch);
 * title/description/category are real public content, so any change to
 * them is what routes a save back into moderation instead of staying live.
 * `imagesDirty` folds in the photo-editing follow-up: adding, removing,
 * replacing, or reordering a photo is exactly as material a change as
 * editing the title — see ArtworkImageManagerHandle/useArtworkImages'
 * `isDirty`, which the caller passes in here rather than this function
 * reaching into image state itself.
 */
function hasMaterialChange(original: Artwork, input: ArtworkDraftInput, imagesDirty: boolean): boolean {
  return (
    imagesDirty ||
    original.title !== input.title.trim() ||
    original.description !== input.description.trim() ||
    original.category !== input.category
  )
}

export function ArtworkForm({ artwork, onSaved }: { artwork?: Artwork; onSaved: (artworkId: string) => void }) {
  const isEdit = !!artwork
  const isAwaitingReview = artwork?.status === 'SUBMITTED'
  const isPublished = artwork?.status === 'PUBLISHED'
  const isRejected = artwork?.status === 'REJECTED'
  const navigate = useNavigate()
  const { create, status: createStatus } = useCreateArtwork()
  const { update, submit, remove, updateSafeFields, resubmitForReview, status: mutateStatus } = useUpdateArtwork()
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [confirmResubmitOpen, setConfirmResubmitOpen] = useState(false)
  const [pendingResubmitInput, setPendingResubmitInput] = useState<ArtworkDraftInput | null>(null)
  const imageManagerRef = useRef<ArtworkImageManagerHandle>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ArtworkDraftFormValues>({
    resolver: zodResolver(artworkDraftSchema),
    defaultValues: toFormValues(artwork),
    mode: 'onTouched',
  })

  const busy = isSubmitting || createStatus === 'saving' || mutateStatus === 'saving'

  const onSubmit = async (values: ArtworkDraftFormValues) => {
    setActionError(null)
    const input: ArtworkDraftInput = {
      title: values.title,
      description: values.description,
      // Whole rupees typed by the seller -> integer minor units (paise)
      // stored in Firestore — see docs/DATABASE.md.
      price: Number(values.price) * 100,
      category: values.category,
      tags: parseTags(values.tags),
      inventoryCount: Number(values.inventoryCount),
    }
    try {
      if (!artwork) {
        const id = await create(input)
        onSaved(id)
        return
      }

      if (isRejected) {
        // Always an explicit resubmission — the confirmation makes it
        // doubly so, even though a REJECTED artwork has no live visibility
        // to lose by comparison to a PUBLISHED one.
        setPendingResubmitInput(input)
        setConfirmResubmitOpen(true)
        return
      }

      if (isPublished) {
        const imagesDirty = imageManagerRef.current?.isDirty ?? false
        if (hasMaterialChange(artwork, input, imagesDirty)) {
          setPendingResubmitInput(input)
          setConfirmResubmitOpen(true)
          return
        }
        await updateSafeFields(artwork.id, { price: input.price, inventoryCount: input.inventoryCount, tags: input.tags })
        onSaved(artwork.id)
        return
      }

      await update(artwork.id, input)
      onSaved(artwork.id)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
    }
  }

  const handleConfirmResubmit = async () => {
    if (!artwork || !pendingResubmitInput) return
    setActionError(null)
    const images = imageManagerRef.current?.getImagesForSave() ?? artwork.images
    try {
      await resubmitForReview(artwork.id, pendingResubmitInput, images)
      imageManagerRef.current?.finalizeSave(images)
      setConfirmResubmitOpen(false)
      setPendingResubmitInput(null)
      onSaved(artwork.id)
    } catch (error) {
      setConfirmResubmitOpen(false)
      setActionError(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
    }
  }

  const handleSubmitForReview = async () => {
    if (!artwork) return
    setActionError(null)
    try {
      await submit(artwork.id)
      onSaved(artwork.id)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
    }
  }

  const handleConfirmDelete = async () => {
    if (!artwork) return
    setActionError(null)
    try {
      await remove(artwork.id, artwork.images)
      setConfirmDeleteOpen(false)
      navigate('/seller-studio/artworks')
    } catch (error) {
      setConfirmDeleteOpen(false)
      setActionError(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
    }
  }

  if (isAwaitingReview) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Badge tone="gold">Awaiting review</Badge>
        </div>
        <p role="status" className="text-sm text-text-secondary">
          This artwork is awaiting admin review and can't be edited right now.
        </p>
        <dl className="flex flex-col gap-3">
          <div>
            <dt className="text-xs text-text-muted">Title</dt>
            <dd className="text-sm text-text-primary">{artwork.title}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Description</dt>
            <dd className="text-sm whitespace-pre-wrap text-text-primary">{artwork.description}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Price</dt>
            <dd className="text-sm text-text-primary">₹{(artwork.price / 100).toFixed(0)}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Category</dt>
            <dd className="text-sm text-text-primary">{CATEGORY_LABEL[artwork.category]}</dd>
          </div>
          {artwork.tags.length > 0 && (
            <div>
              <dt className="text-xs text-text-muted">Tags</dt>
              <dd className="text-sm text-text-primary">{artwork.tags.join(', ')}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-text-muted">Inventory</dt>
            <dd className="text-sm text-text-primary">{artwork.inventoryCount}</dd>
          </div>
        </dl>
        <ArtworkImageManager artwork={artwork} />
      </div>
    )
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {isRejected && (
        <div className="flex flex-col gap-1.5 rounded-md border border-danger/40 bg-surface-elevated p-3">
          <div className="flex items-center gap-2">
            <Badge tone="danger">Rejected</Badge>
          </div>
          <p role="status" className="text-sm text-text-secondary">
            {artwork.rejectionReason
              ? `Reason: ${artwork.rejectionReason}`
              : "This artwork wasn't approved. Correct it below and resubmit for another review."}
          </p>
        </div>
      )}

      {isPublished && (
        <p role="status" className="text-sm text-text-secondary">
          This artwork is live. Price, inventory, and tag changes save immediately and stay live. Changing the
          title, description, category, or photos requires admin review — this artwork won't be visible in the
          marketplace until it's approved again.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="artwork-title" className="text-sm font-medium text-text-secondary">
          Title
        </label>
        <Input
          id="artwork-title"
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? 'artwork-title-error' : undefined}
          {...register('title')}
        />
        {errors.title && (
          <span id="artwork-title-error" className="text-sm font-normal text-danger">
            {errors.title.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="artwork-description" className="text-sm font-medium text-text-secondary">
          Description
        </label>
        <TextArea
          id="artwork-description"
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? 'artwork-description-error' : undefined}
          {...register('description')}
        />
        {errors.description && (
          <span id="artwork-description-error" className="text-sm font-normal text-danger">
            {errors.description.message}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="artwork-price" className="text-sm font-medium text-text-secondary">
            Price (₹)
          </label>
          <Input
            id="artwork-price"
            type="text"
            inputMode="numeric"
            aria-invalid={!!errors.price}
            aria-describedby={errors.price ? 'artwork-price-error' : undefined}
            {...register('price')}
          />
          {errors.price && (
            <span id="artwork-price-error" className="text-sm font-normal text-danger">
              {errors.price.message}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="artwork-inventory" className="text-sm font-medium text-text-secondary">
            Inventory count
          </label>
          <Input
            id="artwork-inventory"
            type="text"
            inputMode="numeric"
            aria-invalid={!!errors.inventoryCount}
            aria-describedby={errors.inventoryCount ? 'artwork-inventory-error' : undefined}
            {...register('inventoryCount')}
          />
          {errors.inventoryCount && (
            <span id="artwork-inventory-error" className="text-sm font-normal text-danger">
              {errors.inventoryCount.message}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="artwork-category" className="text-sm font-medium text-text-secondary">
          Category
        </label>
        <select
          id="artwork-category"
          aria-invalid={!!errors.category}
          aria-describedby={errors.category ? 'artwork-category-error' : undefined}
          className="h-11 w-full rounded-md border border-border-on-light bg-surface-light px-3 text-sm text-text-on-light focus-visible:border-brand-primary aria-invalid:border-danger"
          {...register('category')}
        >
          <option value="">Choose a category</option>
          {ARTWORK_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABEL[category]}
            </option>
          ))}
        </select>
        {errors.category && (
          <span id="artwork-category-error" className="text-sm font-normal text-danger">
            {errors.category.message}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="artwork-tags" className="text-sm font-medium text-text-secondary">
          Tags <span className="font-normal text-text-muted">(optional, comma-separated)</span>
        </label>
        <Input
          id="artwork-tags"
          placeholder="e.g. abstract, canvas, blue"
          aria-invalid={!!errors.tags}
          aria-describedby={errors.tags ? 'artwork-tags-error' : undefined}
          {...register('tags')}
        />
        {errors.tags && (
          <span id="artwork-tags-error" className="text-sm font-normal text-danger">
            {errors.tags.message}
          </span>
        )}
      </div>

      {artwork ? (
        <ArtworkImageManager artwork={artwork} ref={imageManagerRef} />
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">Photos</span>
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border-strong px-3 py-3 text-sm text-text-muted">
            <ImageOff aria-hidden="true" className="h-4 w-4 shrink-0" />
            Save this draft to add photos.
          </div>
        </div>
      )}

      {actionError && (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {isPublished ? (
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        ) : isRejected ? (
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save & resubmit'}
          </Button>
        ) : (
          <>
            <Button type="submit" disabled={busy}>
              {isSubmitting || createStatus === 'saving' ? 'Saving…' : 'Save draft'}
            </Button>
            {isEdit && (
              <>
                <Button type="button" variant="secondary" onClick={handleSubmitForReview} disabled={busy}>
                  Submit for review
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmDeleteOpen(true)} disabled={busy}>
                  Discard draft
                </Button>
              </>
            )}
          </>
        )}
      </div>
      </form>
      {isEdit && !isPublished && !isRejected && (
        <ConfirmDeleteDraftModal
          open={confirmDeleteOpen}
          onClose={() => setConfirmDeleteOpen(false)}
          onConfirm={handleConfirmDelete}
          busy={mutateStatus === 'saving'}
        />
      )}
      {isEdit && (isPublished || isRejected) && (
        <ConfirmResubmitModal
          open={confirmResubmitOpen}
          onClose={() => setConfirmResubmitOpen(false)}
          onConfirm={handleConfirmResubmit}
          busy={mutateStatus === 'saving'}
          variant={isRejected ? 'rejected-resubmit' : 'material-change'}
        />
      )}
    </>
  )
}
