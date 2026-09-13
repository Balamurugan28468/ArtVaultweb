import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const usePendingSellerApplications = vi.fn()
const useSubmittedArtworks = vi.fn()
vi.mock('@/features/admin', () => ({
  usePendingSellerApplications: () => usePendingSellerApplications(),
  useSubmittedArtworks: () => useSubmittedArtworks(),
  SellerApplicationQueue: () => <p>Seller application queue content</p>,
  ArtworkModerationQueue: () => <p>Artwork moderation queue content</p>,
}))

const { AdminPage } = await import('./AdminPage')

describe('AdminPage', () => {
  it('defaults to the Seller Applications tab and shows only that panel', () => {
    usePendingSellerApplications.mockReturnValue({ data: undefined })
    useSubmittedArtworks.mockReturnValue({ data: undefined })
    render(<AdminPage />)

    expect(screen.getByRole('tab', { name: /seller applications/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /artwork moderation/i })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText('Seller application queue content')).toBeInTheDocument()
    expect(screen.queryByText('Artwork moderation queue content')).not.toBeInTheDocument()
  })

  it('switches to the Artwork Moderation tab on click', () => {
    usePendingSellerApplications.mockReturnValue({ data: [] })
    useSubmittedArtworks.mockReturnValue({ data: [] })
    render(<AdminPage />)

    fireEvent.click(screen.getByRole('tab', { name: /artwork moderation/i }))

    expect(screen.getByRole('tab', { name: /artwork moderation/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Artwork moderation queue content')).toBeInTheDocument()
    expect(screen.queryByText('Seller application queue content')).not.toBeInTheDocument()
  })

  it('shows a real count on each tab once loaded, never a fabricated number', () => {
    usePendingSellerApplications.mockReturnValue({ data: [{ uid: 'a' }, { uid: 'b' }] })
    useSubmittedArtworks.mockReturnValue({ data: [{ id: 'x' }] })
    render(<AdminPage />)

    expect(screen.getByRole('tab', { name: /seller applications \(2\)/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /artwork moderation \(1\)/i })).toBeInTheDocument()
  })

  it('shows no count while a queue is still loading, rather than a fake 0', () => {
    usePendingSellerApplications.mockReturnValue({ data: undefined })
    useSubmittedArtworks.mockReturnValue({ data: undefined })
    render(<AdminPage />)

    expect(screen.getByRole('tab', { name: /^seller applications$/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^artwork moderation$/i })).toBeInTheDocument()
  })
})
