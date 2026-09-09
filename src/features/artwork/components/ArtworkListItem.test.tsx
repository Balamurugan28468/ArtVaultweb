import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ArtworkListItem } from './ArtworkListItem'
import type { Artwork } from '../types'

const deleteArtworkDraft = vi.fn()
vi.mock('../api/artworkRepository', () => ({
  deleteArtworkDraft: (...args: unknown[]) => deleteArtworkDraft(...args),
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
  deleteArtworkDraft.mockReset()
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

  it('shows the whole-rupee price converted from stored paise', () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ price: 150000 })} />
      </MemoryRouter>,
    )
    expect(screen.getByText('₹1500')).toBeInTheDocument()
  })

  it('shows a Draft badge for a DRAFT artwork and a Submitted badge for a SUBMITTED one', () => {
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
    expect(screen.getByText('Submitted')).toBeInTheDocument()
  })

  it('shows a "Delete draft" action for a DRAFT artwork', () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'DRAFT' })} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: /delete draft/i })).toBeInTheDocument()
  })

  it('shows no delete action for a SUBMITTED artwork', () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork({ status: 'SUBMITTED' })} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: /delete draft/i })).not.toBeInTheDocument()
  })

  it('deletes the draft after confirming in the accessible dialog', async () => {
    deleteArtworkDraft.mockResolvedValueOnce(undefined)
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork()} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /delete draft/i }))
    const dialog = await screen.findByRole('dialog', { name: /delete this draft/i })

    fireEvent.click(within(dialog).getByRole('button', { name: /^delete draft$/i }))

    await waitFor(() => expect(deleteArtworkDraft).toHaveBeenCalledWith('a1'))
  })

  it('leaves the draft unchanged when the confirmation is cancelled', async () => {
    render(
      <MemoryRouter>
        <ArtworkListItem artwork={buildArtwork()} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /delete draft/i }))
    await screen.findByRole('dialog', { name: /delete this draft/i })

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteArtworkDraft).not.toHaveBeenCalled()
  })
})
