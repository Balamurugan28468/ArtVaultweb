import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ArtworkImageManager } from './ArtworkImageManager'
import type { FileValidationError } from '../api/artworkImageStorage'
import type { Artwork, ArtworkImage } from '../types'

const {
  artworkImagePath,
  deleteArtworkImageObject,
  getArtworkImageDownloadURL,
  newArtworkImageId,
  startArtworkImageUpload,
  validateImageFile,
} = vi.hoisted(() => ({
  artworkImagePath: vi.fn((sellerId: string, artworkId: string, imageId: string) => `artworks/${sellerId}/${artworkId}/${imageId}`),
  deleteArtworkImageObject: vi.fn().mockResolvedValue(undefined),
  getArtworkImageDownloadURL: vi.fn().mockResolvedValue('https://example.test/img.jpg'),
  newArtworkImageId: vi.fn(() => 'generated.jpg'),
  startArtworkImageUpload: vi.fn(() => ({ on: vi.fn(), cancel: vi.fn() })),
  validateImageFile: vi.fn((): FileValidationError | null => null),
}))

vi.mock('../api/artworkImageStorage', () => ({
  artworkImagePath,
  deleteArtworkImageObject,
  getArtworkImageDownloadURL,
  newArtworkImageId,
  startArtworkImageUpload,
  validateImageFile,
}))

const mutateArtworkImages = vi.fn()
vi.mock('../api/artworkRepository', () => ({ mutateArtworkImages: (...args: unknown[]) => mutateArtworkImages(...args) }))

beforeEach(() => {
  deleteArtworkImageObject.mockClear().mockResolvedValue(undefined)
  validateImageFile.mockClear().mockReturnValue(null)
  startArtworkImageUpload.mockClear().mockReturnValue({ on: vi.fn(), cancel: vi.fn() })
  mutateArtworkImages.mockReset().mockResolvedValue([])
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

function buildImage(overrides: Partial<ArtworkImage> = {}): ArtworkImage {
  return { id: 'img1.jpg', path: 'artworks/alice/a1/img1.jpg', url: 'https://example.test/img1.jpg', order: 0, contentType: 'image/jpeg', size: 100, ...overrides }
}

describe('ArtworkImageManager — DRAFT (editable)', () => {
  it('shows an Add photos control and the current count against the maximum', () => {
    render(<ArtworkImageManager artwork={buildArtwork()} />)
    expect(screen.getByRole('button', { name: /add photos/i })).toBeInTheDocument()
    expect(screen.getByText('0 / 6')).toBeInTheDocument()
  })

  it('renders each existing image with remove and reorder controls', () => {
    render(<ArtworkImageManager artwork={buildArtwork({ images: [buildImage()] })} />)
    expect(screen.getByRole('button', { name: /remove photo/i })).toBeInTheDocument()
    expect(screen.getByText(/move later/i)).toBeInTheDocument()
  })

  it('disables the earlier/later move controls at the ends of the list', () => {
    const images = [buildImage({ id: 'a', order: 0 }), buildImage({ id: 'b', path: 'artworks/alice/a1/b.jpg', order: 1 })]
    render(<ArtworkImageManager artwork={buildArtwork({ images })} />)
    const earlierButtons = screen.getAllByText(/move earlier/i)
    const laterButtons = screen.getAllByText(/move later/i)
    expect(earlierButtons[0]).toBeDisabled()
    expect(laterButtons[1]).toBeDisabled()
  })

  it('selecting a valid file shows an uploading entry with its file name', async () => {
    render(<ArtworkImageManager artwork={buildArtwork()} />)
    const input = document.getElementById('artwork-photo-input') as HTMLInputElement
    const file = new File([new Uint8Array(10)], 'sunset.jpg', { type: 'image/jpeg' })

    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText('sunset.jpg')).toBeInTheDocument()
  })

  it('selecting an invalid file shows its rejection message without starting an upload', async () => {
    validateImageFile.mockReturnValueOnce({ code: 'unsupported-type', message: 'Only JPEG, PNG, or WebP images are supported.' })
    render(<ArtworkImageManager artwork={buildArtwork()} />)
    const input = document.getElementById('artwork-photo-input') as HTMLInputElement
    const file = new File([new Uint8Array(10)], 'sunset.gif', { type: 'image/gif' })

    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Only JPEG, PNG, or WebP images are supported.')
    expect(startArtworkImageUpload).not.toHaveBeenCalled()
  })

  it('clicking Remove photo removes it via mutateArtworkImages', async () => {
    render(<ArtworkImageManager artwork={buildArtwork({ images: [buildImage()] })} />)

    fireEvent.click(screen.getByRole('button', { name: /remove photo/i }))

    await waitFor(() => expect(mutateArtworkImages).toHaveBeenCalledWith('a1', expect.any(Function)))
    expect(deleteArtworkImageObject).toHaveBeenCalledWith('artworks/alice/a1/img1.jpg')
  })

  it('disables Add photos and explains the limit once the maximum is reached', () => {
    const images = Array.from({ length: 6 }, (_, i) => buildImage({ id: `img${i}.jpg`, path: `artworks/alice/a1/img${i}.jpg`, order: i }))
    render(<ArtworkImageManager artwork={buildArtwork({ images })} />)

    expect(screen.getByRole('button', { name: /add photos/i })).toBeDisabled()
    expect(screen.getByText(/reached the limit of 6 photos/i)).toBeInTheDocument()
  })
})

describe('ArtworkImageManager — SUBMITTED (read-only)', () => {
  it('shows photos without any add/remove/reorder controls', () => {
    render(<ArtworkImageManager artwork={buildArtwork({ status: 'SUBMITTED', images: [buildImage()] })} />)

    expect(screen.queryByRole('button', { name: /add photos/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove photo/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/move later/i)).not.toBeInTheDocument()
  })

  it('shows an honest empty state when there are no photos', () => {
    render(<ArtworkImageManager artwork={buildArtwork({ status: 'SUBMITTED', images: [] })} />)
    expect(screen.getByText('No photos were added.')).toBeInTheDocument()
  })
})

// Module 13's photo-editing follow-up — a real defect found in owner manual
// testing: a PUBLISHED artwork's Photos section showed no Add/Remove/Reorder
// capability at all, and an empty one showed "No photos were added." with no
// way out of it. Both are fixed by useArtworkImages now treating PUBLISHED
// and REJECTED as editable (as a staged material edit — see its own tests).
describe.each(['PUBLISHED', 'REJECTED'] as const)('ArtworkImageManager — %s (editable, staged material edit)', (status) => {
  it('shows Add photos and, for an existing photo, Remove/reorder controls', () => {
    render(<ArtworkImageManager artwork={buildArtwork({ status, images: [buildImage()] })} />)

    expect(screen.getByRole('button', { name: /add photos/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove photo/i })).toBeInTheDocument()
    expect(screen.getByText(/move later/i)).toBeInTheDocument()
  })

  it('shows the Add photos control (never the dead-end empty-state message) when there are no photos yet', () => {
    render(<ArtworkImageManager artwork={buildArtwork({ status, images: [] })} />)

    expect(screen.getByRole('button', { name: /add photos/i })).toBeInTheDocument()
    expect(screen.queryByText('No photos were added.')).not.toBeInTheDocument()
  })

  it('removing a photo stages the change locally, without calling mutateArtworkImages (the artwork is not DRAFT)', async () => {
    render(<ArtworkImageManager artwork={buildArtwork({ status, images: [buildImage()] })} />)

    fireEvent.click(screen.getByRole('button', { name: /remove photo/i }))

    await waitFor(() => expect(screen.queryByRole('button', { name: /remove photo/i })).not.toBeInTheDocument())
    expect(mutateArtworkImages).not.toHaveBeenCalled()
    expect(deleteArtworkImageObject).not.toHaveBeenCalled()
  })
})
