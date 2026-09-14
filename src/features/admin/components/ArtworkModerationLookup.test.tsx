import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Artwork } from '@/features/artwork'

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/shared/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/ui')>()
  return { ...actual, useToast: () => ({ success: toastSuccess, error: toastError, info: vi.fn() }) }
})

vi.mock('@/features/marketplace', () => ({
  useArtistDisplayNames: (sellerIds: string[]) => Object.fromEntries(sellerIds.map((id) => [id, 'Alice Fine Art'])),
}))

const getArtwork = vi.fn()
vi.mock('@/features/artwork', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/artwork')>()
  return { ...actual, getArtwork: (...args: unknown[]) => getArtwork(...args) }
})

const suspendArtwork = vi.fn()
vi.mock('../api/adminApi', () => ({
  suspendArtwork: (...args: unknown[]) => suspendArtwork(...args),
  isAdminActionError: (value: unknown) => typeof value === 'object' && value !== null && 'message' in value,
}))

const { ArtworkModerationLookup } = await import('./ArtworkModerationLookup')

function buildArtwork(overrides: Partial<Artwork> = {}): Artwork {
  const now = Timestamp.now()
  return {
    id: 'art-42',
    sellerId: 'alice',
    title: 'Ocean View',
    description: 'A real artwork.',
    price: 250000,
    category: 'painting',
    tags: [],
    images: [],
    inventoryCount: 1,
    status: 'PUBLISHED',
    reviewedAt: null,
    rejectionReason: null,
    likeCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function renderLookup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ArtworkModerationLookup />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getArtwork.mockReset()
  suspendArtwork.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
})

describe('ArtworkModerationLookup — lookup', () => {
  it('shows the found artwork — title, artist, price, category, and status — regardless of status', async () => {
    getArtwork.mockResolvedValue(buildArtwork({ status: 'PUBLISHED' }))
    renderLookup()

    fireEvent.input(screen.getByLabelText(/artwork id/i), { target: { value: 'art-42' } })
    fireEvent.click(screen.getByRole('button', { name: /look up/i }))

    expect(await screen.findByText('Ocean View')).toBeInTheDocument()
    expect(screen.getByText('Alice Fine Art')).toBeInTheDocument()
    expect(screen.getByText('₹2500')).toBeInTheDocument()
    expect(getArtwork).toHaveBeenCalledWith('art-42')
  })

  it('shows a "not found" state for an id that resolves to nothing (nonexistent or not permitted)', async () => {
    getArtwork.mockResolvedValue(null)
    renderLookup()

    fireEvent.input(screen.getByLabelText(/artwork id/i), { target: { value: 'ghost' } })
    fireEvent.click(screen.getByRole('button', { name: /look up/i }))

    expect(await screen.findByText(/no artwork was found/i)).toBeInTheDocument()
  })

  it('does not look up a blank id', () => {
    renderLookup()
    expect(screen.getByRole('button', { name: /look up/i })).toBeDisabled()
  })
})

describe('ArtworkModerationLookup — suspend', () => {
  async function lookUpArtwork(overrides: Partial<Artwork> = {}) {
    getArtwork.mockResolvedValue(buildArtwork(overrides))
    renderLookup()
    fireEvent.input(screen.getByLabelText(/artwork id/i), { target: { value: 'art-42' } })
    fireEvent.click(screen.getByRole('button', { name: /look up/i }))
    await screen.findByText('Ocean View')
  }

  it('requires a reason, then suspends the looked-up artwork regardless of its current status', async () => {
    await lookUpArtwork({ status: 'PUBLISHED' })
    suspendArtwork.mockResolvedValue(undefined)
    getArtwork.mockResolvedValueOnce(buildArtwork({ status: 'SUSPENDED' }))

    fireEvent.click(screen.getByRole('button', { name: /^suspend$/i }))
    const dialog = screen.getByRole('dialog', { name: /suspend artwork/i })
    const confirmButton = within(dialog).getByRole('button', { name: /^suspend$/i })

    fireEvent.click(confirmButton)
    expect(suspendArtwork).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/reason is required/i)

    fireEvent.input(within(dialog).getByLabelText(/reason/i), { target: { value: 'Reported for a policy violation.' } })
    fireEvent.click(confirmButton)

    await waitFor(() => expect(suspendArtwork).toHaveBeenCalledWith('art-42', 'Reported for a policy violation.'))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText(/already suspended/i)).toBeInTheDocument())
  })

  it('never shows a Suspend action for an already-SUSPENDED artwork', async () => {
    await lookUpArtwork({ status: 'SUSPENDED' })
    expect(screen.queryByRole('button', { name: /^suspend$/i })).not.toBeInTheDocument()
    expect(screen.getByText(/already suspended/i)).toBeInTheDocument()
  })

  it('shows an error toast and leaves the artwork visible on callable failure', async () => {
    await lookUpArtwork({ status: 'DRAFT' })
    suspendArtwork.mockRejectedValue({ message: 'This action requires an administrator account.' })

    fireEvent.click(screen.getByRole('button', { name: /^suspend$/i }))
    const dialog = screen.getByRole('dialog', { name: /suspend artwork/i })
    fireEvent.input(within(dialog).getByLabelText(/reason/i), { target: { value: 'x' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^suspend$/i }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('This action requires an administrator account.'))
    expect(screen.getByText('Ocean View')).toBeInTheDocument()
  })

  it('cancelling the confirmation never suspends', async () => {
    await lookUpArtwork({ status: 'SUBMITTED' })

    fireEvent.click(screen.getByRole('button', { name: /^suspend$/i }))
    await screen.findByRole('dialog', { name: /suspend artwork/i })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(suspendArtwork).not.toHaveBeenCalled()
  })
})
