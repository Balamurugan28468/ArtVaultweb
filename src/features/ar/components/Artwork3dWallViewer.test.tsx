import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Artwork } from '@/features/artwork'
import { Artwork3dWallViewer } from './Artwork3dWallViewer'

const mockArtwork: Artwork = {
  id: 'art-1',
  sellerId: 'seller-1',
  title: 'Sunset in Venice',
  description: 'Oil on canvas',
  price: 250000,
  category: 'painting',
  tags: ['venice', 'oil'],
  images: [
    {
      id: 'img-1',
      url: 'https://example.com/art.jpg',
      path: 'art.jpg',
      order: 0,
      contentType: 'image/jpeg',
      size: 1000,
    },
  ],
  inventoryCount: 1,
  status: 'PUBLISHED',
  reviewedAt: null,
  rejectionReason: null,
  likeCount: 12,
  createdAt: { toDate: () => new Date('2026-01-01') } as never,
  updatedAt: { toDate: () => new Date('2026-01-01') } as never,
}

describe('Artwork3dWallViewer - Universal Multi-Tier AR', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  })

  it('renders Level 3 3D Gallery Wall simulation by default', () => {
    render(<Artwork3dWallViewer artwork={mockArtwork} />)

    expect(screen.getByText('3D Gallery Wall Simulation')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /UNLOCKED \(ADJUSTABLE\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rotate/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reset/i })).toBeInTheDocument()
    expect(screen.getByText(/Scale: 100%/i)).toBeInTheDocument()
  })

  it('allows manual locking and unlocking of artwork placement', () => {
    render(<Artwork3dWallViewer artwork={mockArtwork} />)

    const lockBtn = screen.getByRole('button', { name: /UNLOCKED \(ADJUSTABLE\)/i })
    fireEvent.click(lockBtn)

    expect(screen.getByRole('button', { name: /LOCKED TO WALL/i })).toBeInTheDocument()

    // Unlock again
    fireEvent.click(screen.getByRole('button', { name: /LOCKED TO WALL/i }))
    expect(screen.getByRole('button', { name: /UNLOCKED \(ADJUSTABLE\)/i })).toBeInTheDocument()
  })

  it('switches between 3D Gallery Wall and Live Camera View', async () => {
    // Mock getUserMedia
    const mockStop = vi.fn()
    const mockStream = {
      getTracks: () => [{ stop: mockStop }],
    }
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    })

    render(<Artwork3dWallViewer artwork={mockArtwork} />)

    const cameraTab = screen.getByRole('button', { name: /Live Camera View/i })
    fireEvent.click(cameraTab)

    await waitFor(() => {
      expect(screen.getByText(/Live Camera Room View/i)).toBeInTheDocument()
    })

    // Switch back to 3D Gallery Wall
    const wallTab = screen.getByRole('button', { name: /^3D Gallery Wall$/i })
    fireEvent.click(wallTab)

    expect(screen.getByText('3D Gallery Wall Simulation')).toBeInTheDocument()
    expect(mockStop).toHaveBeenCalled()
  })

  it('toggles the Device & Connection Guide panel', () => {
    render(<Artwork3dWallViewer artwork={mockArtwork} />)

    const guideBtn = screen.getByRole('button', { name: /Device & Connection Guide/i })
    fireEvent.click(guideBtn)

    expect(screen.getByText(/Universal AR Device & Capability Matrix/i)).toBeInTheDocument()
    expect(screen.getByText(/Wireless Production/i)).toBeInTheDocument()
    expect(screen.getByText(/USB Development/i)).toBeInTheDocument()

    // Toggle off
    fireEvent.click(guideBtn)
    expect(screen.queryByText(/Universal AR Device & Capability Matrix/i)).not.toBeInTheDocument()
  })

  it('handles zoom and fine scale adjustments', () => {
    render(<Artwork3dWallViewer artwork={mockArtwork} />)

    const zoomInBtn = screen.getByRole('button', { name: /Increase scale/i })
    fireEvent.click(zoomInBtn)

    expect(screen.getByText(/Scale: 110%/i)).toBeInTheDocument()

    const resetBtn = screen.getByRole('button', { name: /Reset/i })
    fireEvent.click(resetBtn)

    expect(screen.getByText(/Scale: 100%/i)).toBeInTheDocument()
  })
})
