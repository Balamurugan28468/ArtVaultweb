import { fireEvent, render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { describe, expect, it, vi } from 'vitest'
import type { Artwork } from '@/features/artwork'
import { ArtworkModerationCard } from './ArtworkModerationCard'

function buildArtwork(overrides: Partial<Artwork> = {}): Artwork {
  const now = Timestamp.now()
  return {
    id: 'a1',
    sellerId: 'alice',
    title: 'Silver Surf',
    description: 'A real artwork.',
    price: 150000,
    category: 'painting',
    tags: [],
    images: [],
    inventoryCount: 1,
    status: 'SUBMITTED',
    reviewedAt: null,
    rejectionReason: null,
    likeCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function renderCard(overrides: Partial<Artwork> = {}) {
  return render(
    <ArtworkModerationCard
      artwork={buildArtwork(overrides)}
      artistDisplayName="Alice Fine Art"
      onApprove={vi.fn()}
      onReject={vi.fn()}
      disabled={false}
    />,
  )
}

describe('ArtworkModerationCard — image fallback', () => {
  it('shows the ImageOff placeholder, never a broken-image icon, when the artwork has no images at all', () => {
    const { container } = renderCard({ images: [] })
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it('renders the real image when one exists', () => {
    const { container } = renderCard({
      images: [{ id: 'i1', path: 'p', url: 'https://example.com/real.jpg', order: 0, contentType: 'image/jpeg', size: 100 }],
    })
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/real.jpg')
  })

  it('falls back to the ImageOff placeholder when the image URL fails to load — never leaves the browser default broken-image icon', () => {
    const { container } = renderCard({
      images: [{ id: 'i1', path: 'p', url: 'https://example.com/broken.jpg', order: 0, contentType: 'image/jpeg', size: 100 }],
    })

    fireEvent.error(container.querySelector('img')!)

    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it('picks the lowest-order image as the primary thumbnail', () => {
    const { container } = renderCard({
      images: [
        { id: 'i2', path: 'p2', url: 'https://example.com/second.jpg', order: 1, contentType: 'image/jpeg', size: 100 },
        { id: 'i1', path: 'p1', url: 'https://example.com/first.jpg', order: 0, contentType: 'image/jpeg', size: 100 },
      ],
    })
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/first.jpg')
  })
})

describe('ArtworkModerationCard — content', () => {
  it('renders title, artist name, price, category, and the Publish/Reject actions', () => {
    renderCard({ title: 'Silver Surf', price: 250000, category: 'sculpture' })
    expect(screen.getByText('Silver Surf')).toBeInTheDocument()
    expect(screen.getByText('Alice Fine Art')).toBeInTheDocument()
    expect(screen.getByText('₹2500')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /publish/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
  })

  it('shows "Unknown artist" when no display name resolves', () => {
    render(
      <ArtworkModerationCard artwork={buildArtwork()} artistDisplayName={null} onApprove={vi.fn()} onReject={vi.fn()} disabled={false} />,
    )
    expect(screen.getByText('Unknown artist')).toBeInTheDocument()
  })

  // Admin moderation override (UI-03 final correction) — Suspend only
  // renders when the caller actually wires it up (onSuspend is optional),
  // and calls straight through when it does.
  it('does not render a Suspend action when onSuspend is not provided', () => {
    renderCard()
    expect(screen.queryByRole('button', { name: /suspend/i })).not.toBeInTheDocument()
  })

  it('renders and wires up a Suspend action when onSuspend is provided', () => {
    const onSuspend = vi.fn()
    render(
      <ArtworkModerationCard
        artwork={buildArtwork()}
        artistDisplayName="Alice Fine Art"
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onSuspend={onSuspend}
        disabled={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /suspend/i }))
    expect(onSuspend).toHaveBeenCalledTimes(1)
  })
})
