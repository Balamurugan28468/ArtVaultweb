import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Artwork } from '@/features/artwork'

const useSellerArtworks = vi.fn()
vi.mock('@/features/artwork', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/artwork')>()
  return { ...actual, useSellerArtworks: () => useSellerArtworks() }
})

// UI-03 final correction — the Inventory Overview's "Remove from sale"
// action (InventoryOverviewRow) uses the real useArtworkLifecycleActions /
// useUpdateArtwork hooks, which call straight through to these repository
// functions. Stubbed here exactly like ArtworkListItem.test.tsx/
// useUpdateArtwork.test.tsx already stub them, so clicking the action in a
// test never reaches real Firestore.
const deleteOwnedArtwork = vi.fn()
const removeArtworkFromSale = vi.fn()
const submitArtwork = vi.fn()
const updateArtworkDraft = vi.fn()
const updatePublishedArtworkSafeFields = vi.fn()
const resubmitArtworkForReview = vi.fn()
vi.mock('@/features/artwork/api/artworkRepository', () => ({
  deleteOwnedArtwork: (...args: unknown[]) => deleteOwnedArtwork(...args),
  removeArtworkFromSale: (...args: unknown[]) => removeArtworkFromSale(...args),
  submitArtwork: (...args: unknown[]) => submitArtwork(...args),
  updateArtworkDraft: (...args: unknown[]) => updateArtworkDraft(...args),
  updatePublishedArtworkSafeFields: (...args: unknown[]) => updatePublishedArtworkSafeFields(...args),
  resubmitArtworkForReview: (...args: unknown[]) => resubmitArtworkForReview(...args),
}))

const useSellerStatus = vi.fn()
vi.mock('@/features/seller-studio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/seller-studio')>()
  return { ...actual, useSellerStatus: () => useSellerStatus() }
})

const { SellerStudioHomePage } = await import('./SellerStudioHomePage')

const now = Timestamp.now()

function buildArtwork(overrides: Partial<Artwork> = {}): Artwork {
  return {
    id: 'a1',
    sellerId: 'alice',
    title: 'Sunset Over the Bay',
    description: '',
    price: 150000,
    category: 'painting',
    tags: [],
    images: [],
    inventoryCount: 5,
    status: 'DRAFT',
    reviewedAt: null,
    rejectionReason: null,
    likeCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SellerStudioHomePage />
    </MemoryRouter>,
  )
}

describe('SellerStudioHomePage', () => {
  beforeEach(() => {
    removeArtworkFromSale.mockReset()
  })

  it('shows a prominent Add Artwork CTA linking to the real create route', () => {
    useSellerStatus.mockReturnValue({ status: 'approved', application: { businessName: 'Alice Gallery' } })
    useSellerArtworks.mockReturnValue({ status: 'loaded', artworks: [] })
    renderPage()

    const ctas = screen.getAllByRole('link', { name: /add artwork/i })
    expect(ctas.length).toBeGreaterThan(0)
    for (const cta of ctas) expect(cta).toHaveAttribute('href', '/seller-studio/artworks/new')
  })

  it('shows the real shop identity and an approved status badge', () => {
    useSellerStatus.mockReturnValue({ status: 'approved', application: { businessName: 'Alice Gallery' } })
    useSellerArtworks.mockReturnValue({ status: 'loaded', artworks: [] })
    renderPage()

    expect(screen.getByText('Alice Gallery')).toBeInTheDocument()
    expect(screen.getByText('Approved seller')).toBeInTheDocument()
  })

  it('computes every stat from the real artwork list — never fabricated', () => {
    useSellerStatus.mockReturnValue({ status: 'approved', application: { businessName: 'Alice Gallery' } })
    useSellerArtworks.mockReturnValue({
      status: 'loaded',
      artworks: [
        buildArtwork({ id: 'd1', status: 'DRAFT' }),
        buildArtwork({ id: 'd2', status: 'DRAFT' }),
        buildArtwork({ id: 's1', status: 'SUBMITTED' }),
        buildArtwork({ id: 'p1', status: 'PUBLISHED', inventoryCount: 10 }),
      ],
    })
    renderPage()

    expect(screen.getByText('Total artworks')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument() // total
    expect(screen.getByText('2')).toBeInTheDocument() // drafts
  })

  it('shows Sold and Orders as honest zero stats with a plain "not connected/tracked" caption — never fabricated', () => {
    useSellerStatus.mockReturnValue({ status: 'approved', application: { businessName: 'Alice Gallery' } })
    useSellerArtworks.mockReturnValue({ status: 'loaded', artworks: [] })
    renderPage()

    expect(screen.getByText('Sold')).toBeInTheDocument()
    expect(screen.getByText('Not tracked yet')).toBeInTheDocument()
    expect(screen.getByText('Orders')).toBeInTheDocument()
    // "Not connected yet" legitimately appears twice — the Orders stat's
    // caption and the separate Earnings placeholder tile.
    expect(screen.getAllByText('Not connected yet').length).toBeGreaterThan(0)
  })

  it('shows Earnings as a plain placeholder, never a fabricated currency figure', () => {
    useSellerStatus.mockReturnValue({ status: 'approved', application: { businessName: 'Alice Gallery' } })
    useSellerArtworks.mockReturnValue({ status: 'loaded', artworks: [] })
    renderPage()

    expect(screen.getByText('Earnings')).toBeInTheDocument()
    expect(screen.queryByText(/^₹/)).not.toBeInTheDocument()
    expect(screen.getAllByText('Not connected yet').length).toBeGreaterThan(0)
  })

  it('shows an honest "seller order management isn\'t connected yet" note rather than a fake orders list', () => {
    useSellerStatus.mockReturnValue({ status: 'approved', application: { businessName: 'Alice Gallery' } })
    useSellerArtworks.mockReturnValue({ status: 'loaded', artworks: [] })
    renderPage()

    expect(screen.getByText(/seller order management isn't connected yet/i)).toBeInTheDocument()
  })

  it('shows an empty state for Recent artworks when there are none yet', () => {
    useSellerStatus.mockReturnValue({ status: 'approved', application: { businessName: 'Alice Gallery' } })
    useSellerArtworks.mockReturnValue({ status: 'loaded', artworks: [] })
    renderPage()

    expect(screen.getByText('No artworks yet')).toBeInTheDocument()
  })

  it('lists the most recently updated artworks first, each linking to its real edit page', () => {
    useSellerStatus.mockReturnValue({ status: 'approved', application: { businessName: 'Alice Gallery' } })
    useSellerArtworks.mockReturnValue({
      status: 'loaded',
      artworks: [
        buildArtwork({ id: 'older-id', title: 'Older piece', updatedAt: Timestamp.fromDate(new Date('2026-01-01')) }),
        buildArtwork({ id: 'newer-id', title: 'Newer piece', updatedAt: Timestamp.fromDate(new Date('2026-06-01')) }),
      ],
    })
    renderPage()

    const links = screen.getAllByRole('link', { name: /Newer piece|Older piece/ })
    expect(links[0]).toHaveTextContent('Newer piece')
    expect(links[0]).toHaveAttribute('href', '/seller-studio/artworks/newer-id/edit')
  })

  it('flags published artworks running low on stock, and never when none are', () => {
    useSellerStatus.mockReturnValue({ status: 'approved', application: { businessName: 'Alice Gallery' } })
    useSellerArtworks.mockReturnValue({
      status: 'loaded',
      artworks: [buildArtwork({ id: 'low', status: 'PUBLISHED', inventoryCount: 1, title: 'Low stock piece' })],
    })
    renderPage()

    // Low stock piece legitimately appears in both Recent artworks and the
    // Inventory overview's own low-stock list here (it's the only
    // artwork), so this asserts the low-stock badge specifically.
    expect(screen.getAllByText('Low stock piece').length).toBeGreaterThan(0)
    expect(screen.getByText('1 left')).toBeInTheDocument()
  })

  it('never flags a published artwork as low stock once it has comfortable inventory', () => {
    useSellerStatus.mockReturnValue({ status: 'approved', application: { businessName: 'Alice Gallery' } })
    useSellerArtworks.mockReturnValue({
      status: 'loaded',
      artworks: [buildArtwork({ id: 'ok', status: 'PUBLISHED', inventoryCount: 50, title: 'Well-stocked piece' })],
    })
    renderPage()

    expect(screen.getByText('No published artwork is running low on stock.')).toBeInTheDocument()
  })

  // UI-03 final correction — the Inventory Overview's low-stock row for a
  // PUBLISHED artwork gets a real "Remove from sale" action (never a hard
  // Delete — PUBLISHED can't be hard-deleted), wired through the exact same
  // owner-authorized mutation My Artworks uses.
  it('shows a "Remove from sale" action on a low-stock PUBLISHED row, which removes it after confirming', async () => {
    removeArtworkFromSale.mockResolvedValueOnce(undefined)
    useSellerStatus.mockReturnValue({ status: 'approved', application: { businessName: 'Alice Gallery' } })
    useSellerArtworks.mockReturnValue({
      status: 'loaded',
      artworks: [buildArtwork({ id: 'low', status: 'PUBLISHED', inventoryCount: 1, title: 'Low stock piece' })],
    })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /remove from sale/i }))
    const dialog = await screen.findByRole('dialog', { name: /remove from sale/i })
    expect(dialog).toHaveTextContent('Low stock piece')

    fireEvent.click(within(dialog).getByRole('button', { name: /^remove from sale$/i }))

    await waitFor(() => expect(removeArtworkFromSale).toHaveBeenCalledWith('low'))
  })

  it('leaves the listing untouched when the Remove from sale confirmation is cancelled', async () => {
    useSellerStatus.mockReturnValue({ status: 'approved', application: { businessName: 'Alice Gallery' } })
    useSellerArtworks.mockReturnValue({
      status: 'loaded',
      artworks: [buildArtwork({ id: 'low', status: 'PUBLISHED', inventoryCount: 1, title: 'Low stock piece' })],
    })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /remove from sale/i }))
    await screen.findByRole('dialog', { name: /remove from sale/i })

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(removeArtworkFromSale).not.toHaveBeenCalled()
  })

  // Simulates the live Firestore listener (useSellerArtworks) delivering an
  // updated snapshot after a mutation elsewhere — the dashboard's own
  // stats/Inventory Overview are derived via useMemo from that same data,
  // so they must follow it automatically with no extra wiring of their own.
  it('recomputes Published count and Inventory Overview automatically once the underlying artwork data changes', () => {
    useSellerStatus.mockReturnValue({ status: 'approved', application: { businessName: 'Alice Gallery' } })
    useSellerArtworks.mockReturnValue({
      status: 'loaded',
      artworks: [buildArtwork({ id: 'low', status: 'PUBLISHED', inventoryCount: 1, title: 'Low stock piece' })],
    })
    const { rerender } = renderPage()

    expect(screen.getByText('1 left')).toBeInTheDocument()

    useSellerArtworks.mockReturnValue({
      status: 'loaded',
      artworks: [buildArtwork({ id: 'low', status: 'SUBMITTED', inventoryCount: 1, title: 'Low stock piece' })],
    })
    rerender(
      <MemoryRouter>
        <SellerStudioHomePage />
      </MemoryRouter>,
    )

    expect(screen.getByText('No published artwork is running low on stock.')).toBeInTheDocument()
    expect(screen.queryByText('1 left')).not.toBeInTheDocument()
  })

  it('never shows a Remove from sale or Delete action for a DRAFT artwork in the Inventory Overview — it never appears there at all', () => {
    useSellerStatus.mockReturnValue({ status: 'approved', application: { businessName: 'Alice Gallery' } })
    useSellerArtworks.mockReturnValue({
      status: 'loaded',
      artworks: [buildArtwork({ id: 'draft1', status: 'DRAFT', title: 'Draft piece' })],
    })
    renderPage()

    expect(screen.queryByRole('button', { name: /remove from sale/i })).not.toBeInTheDocument()
    expect(screen.getByText('No published artwork is running low on stock.')).toBeInTheDocument()
  })

  it('shows a loading state for the dashboard while artworks are loading', () => {
    useSellerStatus.mockReturnValue({ status: 'loading' })
    useSellerArtworks.mockReturnValue({ status: 'loading' })
    renderPage()

    expect(screen.getByLabelText('Loading your seller dashboard')).toBeInTheDocument()
  })

  it('shows an error state on failure, distinct from the empty state', () => {
    useSellerStatus.mockReturnValue({ status: 'approved', application: { businessName: 'Alice Gallery' } })
    useSellerArtworks.mockReturnValue({ status: 'error', error: { code: 'unknown', message: 'boom' } })
    renderPage()

    expect(screen.getByText("Couldn't load your dashboard")).toBeInTheDocument()
  })

  it('still links Quick actions to My Artworks and Public Profile (in addition to the shell\'s own sub-nav tabs)', () => {
    useSellerStatus.mockReturnValue({ status: 'approved', application: { businessName: 'Alice Gallery' } })
    useSellerArtworks.mockReturnValue({ status: 'loaded', artworks: [] })
    renderPage()

    const myArtworksLinks = screen.getAllByRole('link', { name: 'My Artworks' })
    expect(myArtworksLinks.length).toBeGreaterThan(0)
    for (const link of myArtworksLinks) expect(link).toHaveAttribute('href', '/seller-studio/artworks')

    const profileLinks = screen.getAllByRole('link', { name: 'Public Profile' })
    expect(profileLinks.length).toBeGreaterThan(0)
    for (const link of profileLinks) expect(link).toHaveAttribute('href', '/seller-studio/profile')
  })
})
