import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ArtworkListItem } from './ArtworkListItem'
import type { Artwork } from '../types'

const deleteOwnedArtwork = vi.fn()
const removeArtworkFromSale = vi.fn()
vi.mock('../api/artworkRepository', () => ({
  deleteOwnedArtwork: (...args: unknown[]) => deleteOwnedArtwork(...args),
  removeArtworkFromSale: (...args: unknown[]) => removeArtworkFromSale(...args),
  updateArtworkDraft: vi.fn(),
  submitArtwork: vi.fn(),
}))

// useUpdateArtwork's remove() also best-effort deletes each image's Storage
// object before deleting the draft (Module 05) — stubbed out here since
// these fixtures have no images and this file isn't exercising that path.
vi.mock('../api/artworkImageStorage', () => ({
  deleteArtworkImageObject: vi.fn().mockResolvedValue(undefined),
}))

beforeEach(() => {
  deleteOwnedArtwork.mockReset()
  removeArtworkFromSale.mockReset()
})

const now = Timestamp.now()

function buildArtwork(overrides: Partial<Artwork> = {}): Artwork {
  return {
    id: 'a1',
    sellerId: 'alice',
    title: 'Sunset',
    description: 'A painting.',
    price: 150000,
    category: 'painting',
    tags: [],
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

describe('ArtworkListItem', () => {
  it('links to the edit page for this artwork', () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork()} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/seller-studio/artworks/a1/edit')
  })

  it('links to the edit page for PUBLISHED and REJECTED artworks too — an obvious Edit / Edit & resubmit entry point wherever editing is legitimately allowed', () => {
    for (const status of ['PUBLISHED', 'REJECTED'] as const) {
      const { unmount } = render(
        <MemoryRouter>
          <ArtworkListItem artwork={buildArtwork({ id: 'a2', status })} />
        </MemoryRouter>,
      )
      expect(screen.getByRole('link')).toHaveAttribute('href', '/seller-studio/artworks/a2/edit')
      unmount()
    }
  })

  it('shows the whole-rupee price converted from stored paise', () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ price: 150000 })} />
      </MemoryRouter>,
    )
    expect(screen.getByText('₹1500')).toBeInTheDocument()
  })

  it('shows the real, accurate badge for every status — never mislabeling PUBLISHED/REJECTED as Draft (Module 13 Phase 4 regression)', () => {
    const { rerender } = render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'DRAFT' })} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Draft')).toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'SUBMITTED' })} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Awaiting review')).toBeInTheDocument()
    expect(screen.queryByText('Draft')).not.toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'PUBLISHED' })} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Published')).toBeInTheDocument()
    expect(screen.queryByText('Draft')).not.toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'REJECTED' })} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Rejected')).toBeInTheDocument()
    expect(screen.queryByText('Draft')).not.toBeInTheDocument()
  })

  it('shows a "Delete" action for a DRAFT artwork', () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'DRAFT' })} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove from sale/i })).not.toBeInTheDocument()
  })

  // UI-03 final correction — REJECTED joins DRAFT as deletable (see
  // firestore.rules' own `allow delete`); it was previously wrongly denied
  // a delete action even though nothing about it is locked the way
  // SUBMITTED is.
  it('shows a "Delete" action for a REJECTED artwork too', () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'REJECTED' })} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove from sale/i })).not.toBeInTheDocument()
  })

  // Seller artwork recovery/control (UI-03 final correction) — PUBLISHED
  // now gets both controls side by side: Remove from sale (non-destructive,
  // re-enters moderation) and a real hard Delete, not one instead of the
  // other.
  it('shows both "Remove from sale" and "Delete" actions for a PUBLISHED artwork', () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'PUBLISHED' })} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: /remove from sale/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })

  it('shows neither Delete nor Remove from sale for a SUBMITTED artwork — it stays locked', () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'SUBMITTED' })} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove from sale/i })).not.toBeInTheDocument()
  })

  // Seller artwork recovery/control (UI-03 final correction) — a SUSPENDED
  // artwork is no longer locked to the owner: it gets a real Delete, exactly
  // like REJECTED, but never "Remove from sale" (it's already off the
  // marketplace, so that transition has nothing to do).
  it('shows a "Delete" action (never "Remove from sale") for a SUSPENDED artwork', () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'SUSPENDED' })} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove from sale/i })).not.toBeInTheDocument()
    expect(screen.getByText('Suspended')).toBeInTheDocument()
  })

  it('links to "Edit", never "View", for a SUSPENDED artwork — it is fully editable again', () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'SUSPENDED' })} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/seller-studio/artworks/a1/edit')
  })

  it('shows the real rejection reason for a REJECTED artwork', () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'REJECTED', rejectionReason: 'Blurry photos.' })} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/blurry photos/i)).toBeInTheDocument()
  })

  it('shows the real admin suspension reason for a SUSPENDED artwork', () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'SUSPENDED', rejectionReason: 'Reported for a policy violation.' })} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/reported for a policy violation/i)).toBeInTheDocument()
  })

  it('never shows the rejection reason line for a non-REJECTED artwork', () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'PUBLISHED', rejectionReason: null })} />
      </MemoryRouter>,
    )
    expect(screen.queryByText(/rejection/i)).not.toBeInTheDocument()
  })

  it('deletes a DRAFT after confirming in the accessible dialog, which names the artwork', async () => {
    deleteOwnedArtwork.mockResolvedValueOnce(undefined)
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ title: 'Sunset' })} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    const dialog = await screen.findByRole('dialog', { name: /delete this artwork/i })
    expect(dialog).toHaveTextContent('Sunset')
    expect(dialog).toHaveTextContent('This action cannot be undone.')

    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }))

    await waitFor(() => expect(deleteOwnedArtwork).toHaveBeenCalledWith('a1'))
  })

  it('deletes a REJECTED artwork after confirming — owner-authorized via the same repository path as DRAFT', async () => {
    deleteOwnedArtwork.mockResolvedValueOnce(undefined)
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'REJECTED', title: 'Blurry piece' })} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    const dialog = await screen.findByRole('dialog', { name: /delete this artwork/i })
    expect(dialog).toHaveTextContent('Blurry piece')

    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }))

    await waitFor(() => expect(deleteOwnedArtwork).toHaveBeenCalledWith('a1'))
  })

  it('deletes a SUSPENDED artwork after confirming — owner-authorized via the same repository path as DRAFT/REJECTED', async () => {
    deleteOwnedArtwork.mockResolvedValueOnce(undefined)
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'SUSPENDED', title: 'Flagged piece' })} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    const dialog = await screen.findByRole('dialog', { name: /delete this artwork/i })
    expect(dialog).toHaveTextContent('Flagged piece')

    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }))

    await waitFor(() => expect(deleteOwnedArtwork).toHaveBeenCalledWith('a1'))
  })

  it('deletes a PUBLISHED artwork after confirming, independent of Remove from sale', async () => {
    deleteOwnedArtwork.mockResolvedValueOnce(undefined)
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'PUBLISHED', title: 'Ocean view' })} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    const dialog = await screen.findByRole('dialog', { name: /delete this artwork/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }))

    await waitFor(() => expect(deleteOwnedArtwork).toHaveBeenCalledWith('a1'))
    expect(removeArtworkFromSale).not.toHaveBeenCalled()
  })

  it('removes a PUBLISHED artwork from sale after confirming — the safe PUBLISHED -> SUBMITTED transition, never a hard delete', async () => {
    removeArtworkFromSale.mockResolvedValueOnce(undefined)
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'PUBLISHED', title: 'Ocean view' })} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /remove from sale/i }))
    const dialog = await screen.findByRole('dialog', { name: /remove from sale/i })
    expect(dialog).toHaveTextContent('Ocean view')

    fireEvent.click(within(dialog).getByRole('button', { name: /^remove from sale$/i }))

    await waitFor(() => expect(removeArtworkFromSale).toHaveBeenCalledWith('a1'))
    expect(deleteOwnedArtwork).not.toHaveBeenCalled()
  })

  it('cancelling the Remove from sale dialog never mutates the artwork', async () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'PUBLISHED' })} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /remove from sale/i }))
    await screen.findByRole('dialog', { name: /remove from sale/i })

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(removeArtworkFromSale).not.toHaveBeenCalled()
  })

  // UI-03 — real data added to the card: thumbnail, category, last-updated.
  it('shows the artwork thumbnail when one exists', () => {
    const { container } = render(
      <MemoryRouter>
        <ArtworkListItem
          artwork={buildArtwork({
            images: [{ id: 'i1', path: 'p', url: 'https://example.com/a.jpg', order: 0, contentType: 'image/jpeg', size: 1 }],
          })}
        />
      </MemoryRouter>,
    )
    // Decorative (alt=""), so it has no accessible "img" role — queried
    // directly rather than via screen.getByRole.
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/a.jpg')
  })

  it('shows a placeholder icon, never a broken image, when the artwork has no photos', () => {
    const { container } = render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ images: [] })} />
      </MemoryRouter>,
    )
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it('shows the real category', () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ category: 'sculpture' })} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Sculpture')).toBeInTheDocument()
  })

  it('shows real stock and last-updated information', () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ inventoryCount: 7, updatedAt: Timestamp.fromDate(new Date('2026-03-15')) })} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/7 in stock/)).toBeInTheDocument()
    expect(screen.getByText(/Updated/)).toBeInTheDocument()
  })

  it('leaves the artwork unchanged when the delete confirmation is cancelled', async () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork()} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await screen.findByRole('dialog', { name: /delete this artwork/i })

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteOwnedArtwork).not.toHaveBeenCalled()
  })
})
