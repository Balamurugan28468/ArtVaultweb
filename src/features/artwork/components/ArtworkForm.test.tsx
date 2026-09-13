import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ArtworkForm } from './ArtworkForm'
import type { Artwork } from '../types'

const createArtworkDraft = vi.fn()
const updateArtworkDraft = vi.fn()
const submitArtwork = vi.fn()
const deleteArtworkDraft = vi.fn()
const mutateArtworkImages = vi.fn()
const updatePublishedArtworkSafeFields = vi.fn()
const resubmitArtworkForReview = vi.fn()
vi.mock('../api/artworkRepository', () => ({
  createArtworkDraft: (...args: unknown[]) => createArtworkDraft(...args),
  updateArtworkDraft: (...args: unknown[]) => updateArtworkDraft(...args),
  submitArtwork: (...args: unknown[]) => submitArtwork(...args),
  deleteArtworkDraft: (...args: unknown[]) => deleteArtworkDraft(...args),
  mutateArtworkImages: (...args: unknown[]) => mutateArtworkImages(...args),
  updatePublishedArtworkSafeFields: (...args: unknown[]) => updatePublishedArtworkSafeFields(...args),
  resubmitArtworkForReview: (...args: unknown[]) => resubmitArtworkForReview(...args),
}))

// ArtworkImageManager (rendered whenever an existing artwork is passed in)
// pulls in the real Storage SDK via artworkImageStorage.ts — stubbed out
// here since this file is only exercising ArtworkForm's own form/lifecycle
// behavior, not Module 05's upload flow (covered by
// ArtworkImageManager.test.tsx and useArtworkImages.test.tsx).
vi.mock('../api/artworkImageStorage', () => ({
  artworkImagePath: vi.fn(),
  deleteArtworkImageObject: vi.fn().mockResolvedValue(undefined),
  getArtworkImageDownloadURL: vi.fn(),
  newArtworkImageId: vi.fn(),
  startArtworkImageUpload: vi.fn(),
  validateImageFile: vi.fn(() => null),
}))

const useAuth = vi.fn()
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => useAuth() }))

beforeEach(() => {
  createArtworkDraft.mockReset()
  updateArtworkDraft.mockReset()
  submitArtwork.mockReset()
  deleteArtworkDraft.mockReset()
  mutateArtworkImages.mockReset().mockResolvedValue([])
  updatePublishedArtworkSafeFields.mockReset()
  resubmitArtworkForReview.mockReset()
  useAuth.mockReturnValue({ user: { uid: 'alice' } })
})

function renderForm(props: Partial<Parameters<typeof ArtworkForm>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ArtworkForm onSaved={vi.fn()} {...props} />
    </MemoryRouter>,
  )
}

function fillValidForm() {
  fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Sunset Over the Bay' } })
  fireEvent.input(screen.getByLabelText('Description'), { target: { value: 'An oil painting of golden hour.' } })
  fireEvent.input(screen.getByLabelText(/price/i), { target: { value: '1500' } })
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'painting' } })
  fireEvent.input(screen.getByLabelText(/inventory count/i), { target: { value: '2' } })
}

const now = Timestamp.now()
function buildArtwork(overrides: Partial<Artwork> = {}): Artwork {
  return {
    id: 'a1',
    sellerId: 'alice',
    title: 'Sunset',
    description: 'A painting.',
    price: 150000,
    category: 'painting',
    tags: ['blue'],
    images: [],
    inventoryCount: 3,
    status: 'DRAFT',
    reviewedAt: null,
    rejectionReason: null,
    likeCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('ArtworkForm — create mode', () => {
  it('shows a disabled, honest photo-upload placeholder — no functional-looking button that does nothing', () => {
    renderForm()
    expect(screen.getByText(/save this draft to add photos/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add photos/i })).not.toBeInTheDocument()
  })

  it('shows validation errors instead of submitting when required fields are empty', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }))

    expect(await screen.findByText('Title is required.')).toBeInTheDocument()
    expect(createArtworkDraft).not.toHaveBeenCalled()
  })

  it('marks an invalid field with aria-invalid and points aria-describedby at the error', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }))

    const titleInput = await screen.findByLabelText('Title')
    expect(titleInput).toHaveAttribute('aria-invalid', 'true')
    expect(titleInput.getAttribute('aria-describedby')).toContain('artwork-title-error')
  })

  it('rejects a non-numeric price with a specific message', async () => {
    renderForm()
    fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Sunset Over the Bay' } })
    fireEvent.input(screen.getByLabelText(/price/i), { target: { value: 'free' } })
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }))

    expect(await screen.findByText('Price must be a whole number.')).toBeInTheDocument()
  })

  it('creates a draft, converting whole-rupee price input to integer paise', async () => {
    createArtworkDraft.mockResolvedValueOnce('a1')
    const onSaved = vi.fn()
    renderForm({ onSaved })

    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('a1'))
    expect(createArtworkDraft).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ title: 'Sunset Over the Bay', price: 150000, category: 'painting', inventoryCount: 2 }),
    )
  })

  it('does not show Submit for review or Discard draft in create mode', () => {
    renderForm()
    expect(screen.queryByRole('button', { name: /submit for review/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /discard draft/i })).not.toBeInTheDocument()
  })

  it('shows a safe server-error message on failure', async () => {
    createArtworkDraft.mockRejectedValueOnce(new Error('You do not have permission to do that.'))
    renderForm()

    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission to do that.')
  })

  it('disables Save draft while in flight, preventing duplicate submits', async () => {
    let resolveCreate: (id: string) => void = () => {}
    createArtworkDraft.mockImplementationOnce(() => new Promise<string>((resolve) => (resolveCreate = resolve)))
    renderForm()

    fillValidForm()
    const saveButton = screen.getByRole('button', { name: /save draft/i })
    fireEvent.click(saveButton)

    await waitFor(() => expect(saveButton).toBeDisabled())
    expect(createArtworkDraft).toHaveBeenCalledTimes(1)

    fireEvent.click(saveButton)
    expect(createArtworkDraft).toHaveBeenCalledTimes(1)

    resolveCreate('a1')
  })
})

describe('ArtworkForm — edit mode (DRAFT)', () => {
  it('prefills the form from the existing draft, converting stored paise back to whole rupees', () => {
    renderForm({ artwork: buildArtwork({ price: 150000 }) })
    expect(screen.getByLabelText('Title')).toHaveValue('Sunset')
    expect(screen.getByLabelText(/price/i)).toHaveValue('1500')
  })

  it('shows Submit for review and Discard draft actions', () => {
    renderForm({ artwork: buildArtwork() })
    expect(screen.getByRole('button', { name: /submit for review/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /discard draft/i })).toBeInTheDocument()
  })

  it('saves edits via update, not create', async () => {
    updateArtworkDraft.mockResolvedValueOnce(undefined)
    const onSaved = vi.fn()
    renderForm({ artwork: buildArtwork(), onSaved })

    fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Sunset Updated' } })
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('a1'))
    expect(updateArtworkDraft).toHaveBeenCalledWith('a1', expect.objectContaining({ title: 'Sunset Updated' }))
    expect(createArtworkDraft).not.toHaveBeenCalled()
  })

  it('submits for review', async () => {
    submitArtwork.mockResolvedValueOnce(undefined)
    const onSaved = vi.fn()
    renderForm({ artwork: buildArtwork(), onSaved })

    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))

    await waitFor(() => expect(submitArtwork).toHaveBeenCalledWith('a1'))
    expect(onSaved).toHaveBeenCalledWith('a1')
  })

  it('shows an accessible confirmation dialog before discarding — never a native window.confirm', async () => {
    deleteArtworkDraft.mockResolvedValueOnce(undefined)
    renderForm({ artwork: buildArtwork() })

    fireEvent.click(screen.getByRole('button', { name: /discard draft/i }))

    const dialog = await screen.findByRole('dialog', { name: /delete this draft/i })
    expect(dialog).toHaveTextContent('This action cannot be undone.')
    expect(deleteArtworkDraft).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /^delete draft$/i }))

    await waitFor(() => expect(deleteArtworkDraft).toHaveBeenCalledWith('a1'))
  })

  it('does not discard when the confirmation dialog is cancelled', async () => {
    renderForm({ artwork: buildArtwork() })

    fireEvent.click(screen.getByRole('button', { name: /discard draft/i }))
    await screen.findByRole('dialog', { name: /delete this draft/i })

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteArtworkDraft).not.toHaveBeenCalled()
  })
})

describe('ArtworkForm — SUBMITTED (locked)', () => {
  it('renders a read-only summary instead of an editable form, clearly labeled as awaiting review', () => {
    renderForm({ artwork: buildArtwork({ status: 'SUBMITTED' }) })

    expect(screen.getByText('Awaiting review')).toBeInTheDocument()
    expect(screen.getByText(/awaiting admin review/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save draft/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit for review/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /discard draft/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save & resubmit/i })).not.toBeInTheDocument()
  })
})

describe('ArtworkForm — edit mode (PUBLISHED, Module 13 Phase 4)', () => {
  it('explains that safe-field changes stay live while content changes require review', () => {
    renderForm({ artwork: buildArtwork({ status: 'PUBLISHED' }) })
    expect(screen.getByText(/price, inventory, and tag changes save immediately and stay live/i)).toBeInTheDocument()
  })

  it('never shows Submit for review or Discard draft — those are DRAFT-only actions', () => {
    renderForm({ artwork: buildArtwork({ status: 'PUBLISHED' }) })
    expect(screen.queryByRole('button', { name: /submit for review/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /discard draft/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })

  it('a safe-fields-only change (price/inventory/tags) saves immediately with no confirmation dialog, and stays PUBLISHED', async () => {
    updatePublishedArtworkSafeFields.mockResolvedValueOnce(undefined)
    const onSaved = vi.fn()
    renderForm({ artwork: buildArtwork({ status: 'PUBLISHED', price: 150000, inventoryCount: 3, tags: ['blue'] }), onSaved })

    fireEvent.input(screen.getByLabelText(/price/i), { target: { value: '1750' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('a1'))
    expect(updatePublishedArtworkSafeFields).toHaveBeenCalledWith('a1', { price: 175000, inventoryCount: 3, tags: ['blue'] })
    expect(resubmitArtworkForReview).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('changing the title shows a confirmation before resubmitting for review — never a silent unpublish', async () => {
    renderForm({ artwork: buildArtwork({ status: 'PUBLISHED', title: 'Original Title' }) })

    fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'New Title' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    const dialog = await screen.findByRole('dialog', { name: /require admin review/i })
    expect(dialog).toHaveTextContent(/won't be visible in the marketplace/i)
    expect(resubmitArtworkForReview).not.toHaveBeenCalled()
  })

  it('confirming a material change calls resubmitArtworkForReview, moving the artwork back into review', async () => {
    resubmitArtworkForReview.mockResolvedValueOnce(undefined)
    const onSaved = vi.fn()
    renderForm({ artwork: buildArtwork({ status: 'PUBLISHED', title: 'Original Title' }), onSaved })

    fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'New Title' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))

    await waitFor(() =>
      expect(resubmitArtworkForReview).toHaveBeenCalledWith('a1', expect.objectContaining({ title: 'New Title' }), []),
    )
    expect(onSaved).toHaveBeenCalledWith('a1')
    expect(updatePublishedArtworkSafeFields).not.toHaveBeenCalled()
  })

  it('adding a photo alone (no text field change) on a PUBLISHED artwork is also a material edit requiring confirmation', async () => {
    const task = { on: vi.fn(), cancel: vi.fn() }
    const artworkImageStorage = await import('../api/artworkImageStorage')
    vi.mocked(artworkImageStorage.startArtworkImageUpload).mockReturnValueOnce(task as never)
    vi.mocked(artworkImageStorage.getArtworkImageDownloadURL).mockResolvedValueOnce('https://example.test/new.jpg')
    vi.mocked(artworkImageStorage.newArtworkImageId).mockReturnValueOnce('new.jpg')
    vi.mocked(artworkImageStorage.artworkImagePath).mockReturnValueOnce('artworks/alice/a1/new.jpg')
    resubmitArtworkForReview.mockResolvedValueOnce(undefined)
    const onSaved = vi.fn()
    renderForm({ artwork: buildArtwork({ status: 'PUBLISHED' }), onSaved })

    const input = document.getElementById('artwork-photo-input') as HTMLInputElement
    const file = new File([new Uint8Array(10)], 'new.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(task.on).toHaveBeenCalled())
    // `.on(event, snapshotCb, errorCb, completeCb)` — trigger the upload's
    // success path so the new photo lands in the staged images array.
    const completeCb = task.on.mock.calls[0]?.[3] as () => void
    await waitFor(() => completeCb())

    // Text fields are untouched — only the staged photo addition can be
    // what routes this through the material-edit confirmation instead of
    // straight through the safe-fields path.
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    const dialog = await screen.findByRole('dialog', { name: /require admin review/i })
    expect(updatePublishedArtworkSafeFields).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: /submit for review/i }))

    await waitFor(() =>
      expect(resubmitArtworkForReview).toHaveBeenCalledWith(
        'a1',
        expect.anything(),
        expect.arrayContaining([expect.objectContaining({ id: 'new.jpg', path: 'artworks/alice/a1/new.jpg' })]),
      ),
    )
    expect(onSaved).toHaveBeenCalledWith('a1')
  })

  it('cancelling the confirmation dialog never resubmits', async () => {
    renderForm({ artwork: buildArtwork({ status: 'PUBLISHED', description: 'Original description here.' }) })

    fireEvent.input(screen.getByLabelText('Description'), { target: { value: 'A brand new description entirely.' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(resubmitArtworkForReview).not.toHaveBeenCalled()
  })

  it('changing category alone also requires confirmation (a material field, not a safe one)', async () => {
    renderForm({ artwork: buildArtwork({ status: 'PUBLISHED', category: 'painting' }) })

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'sculpture' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await screen.findByRole('dialog', { name: /require admin review/i })
    expect(updatePublishedArtworkSafeFields).not.toHaveBeenCalled()
  })
})

describe('ArtworkForm — edit mode (REJECTED, Module 13 Phase 4)', () => {
  it('displays the real rejection reason', () => {
    renderForm({ artwork: buildArtwork({ status: 'REJECTED', rejectionReason: 'Blurry photos.' }) })
    expect(screen.getByText(/blurry photos/i)).toBeInTheDocument()
  })

  it('handles a REJECTED artwork with no rejection reason gracefully — no "null"/"undefined" text', () => {
    renderForm({ artwork: buildArtwork({ status: 'REJECTED', rejectionReason: null }) })
    expect(screen.queryByText(/null|undefined/i)).not.toBeInTheDocument()
  })

  it('shows a "Save & resubmit" action, never Submit for review or Discard draft', () => {
    renderForm({ artwork: buildArtwork({ status: 'REJECTED' }) })
    expect(screen.getByRole('button', { name: /save & resubmit/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit for review/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /discard draft/i })).not.toBeInTheDocument()
  })

  it('requires confirmation before resubmitting, then calls resubmitArtworkForReview clearing the old reason', async () => {
    resubmitArtworkForReview.mockResolvedValueOnce(undefined)
    const onSaved = vi.fn()
    renderForm({ artwork: buildArtwork({ status: 'REJECTED', rejectionReason: 'Blurry photos.' }), onSaved })

    fireEvent.input(screen.getByLabelText('Description'), { target: { value: 'A corrected, in-focus description.' } })
    fireEvent.click(screen.getByRole('button', { name: /save & resubmit/i }))

    const dialog = await screen.findByRole('dialog', { name: /resubmit for review/i })
    expect(resubmitArtworkForReview).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: /submit for review/i }))

    await waitFor(() =>
      expect(resubmitArtworkForReview).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({ description: 'A corrected, in-focus description.' }),
        [],
      ),
    )
    expect(onSaved).toHaveBeenCalledWith('a1')
  })
})
