import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/shared/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/ui')>()
  return { ...actual, useToast: () => ({ success: toastSuccess, error: toastError, info: vi.fn() }) }
})

vi.mock('@/features/marketplace', () => ({
  useArtistDisplayNames: (sellerIds: string[]) => Object.fromEntries(sellerIds.map((id) => [id, 'Alice Fine Art'])),
}))

const getSubmittedArtworks = vi.fn()
vi.mock('../api/adminQueueRepository', () => ({
  getPendingSellerApplications: vi.fn(),
  getSubmittedArtworks: (...args: unknown[]) => getSubmittedArtworks(...args),
}))

const moderateArtwork = vi.fn()
const suspendArtwork = vi.fn()
vi.mock('../api/adminApi', () => ({
  approveSellerApplication: vi.fn(),
  rejectSellerApplication: vi.fn(),
  moderateArtwork: (...args: unknown[]) => moderateArtwork(...args),
  suspendArtwork: (...args: unknown[]) => suspendArtwork(...args),
  isAdminActionError: (value: unknown) => typeof value === 'object' && value !== null && 'message' in value,
}))

const { ArtworkModerationQueue } = await import('./ArtworkModerationQueue')

function artwork(overrides: Record<string, unknown> = {}) {
  const now = Timestamp.now()
  return {
    id: 'a1',
    sellerId: 'alice',
    title: 'Sunset Over the Bay',
    description: 'An oil painting.',
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

function renderQueue() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ArtworkModerationQueue />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getSubmittedArtworks.mockReset()
  moderateArtwork.mockReset()
  suspendArtwork.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
})

describe('ArtworkModerationQueue — queue states', () => {
  it('shows a loading state', () => {
    getSubmittedArtworks.mockReturnValue(new Promise(() => {}))
    renderQueue()
    expect(screen.getByLabelText(/loading submitted artworks/i)).toBeInTheDocument()
  })

  it('shows an empty state when nothing is awaiting review', async () => {
    getSubmittedArtworks.mockResolvedValue([])
    renderQueue()
    expect(await screen.findByText(/no artworks awaiting review/i)).toBeInTheDocument()
  })

  // Admin moderation override (UI-03 final correction) — the by-id lookup
  // tool targets any artwork regardless of status, so it must stay visible
  // no matter what state the SUBMITTED queue itself is in.
  it('shows the "Moderate an artwork by ID" lookup tool regardless of queue state', async () => {
    getSubmittedArtworks.mockResolvedValue([])
    renderQueue()
    expect(screen.getByRole('heading', { name: /moderate an artwork by id/i })).toBeInTheDocument()
    await screen.findByText(/no artworks awaiting review/i)
    expect(screen.getByRole('heading', { name: /moderate an artwork by id/i })).toBeInTheDocument()
  })

  it('shows an error state on query failure, with a retry action', async () => {
    getSubmittedArtworks.mockRejectedValue({ code: 'unknown', message: 'boom' })
    renderQueue()
    expect(await screen.findByText(/couldn't load artworks awaiting review/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('renders each submitted artwork with its artist name', async () => {
    getSubmittedArtworks.mockResolvedValue([artwork()])
    renderQueue()
    expect(await screen.findByText('Sunset Over the Bay')).toBeInTheDocument()
    expect(screen.getByText('Alice Fine Art')).toBeInTheDocument()
  })
})

describe('ArtworkModerationQueue — publish (approve)', () => {
  it('requires confirmation, sends decision=PUBLISHED, and the artwork leaves the queue on success', async () => {
    getSubmittedArtworks.mockResolvedValueOnce([artwork()]).mockResolvedValueOnce([])
    moderateArtwork.mockResolvedValue(undefined)
    renderQueue()

    fireEvent.click(await screen.findByRole('button', { name: /^publish$/i }))
    const dialog = screen.getByRole('dialog', { name: /publish artwork/i })
    expect(moderateArtwork).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: /^publish$/i }))

    await waitFor(() => expect(moderateArtwork).toHaveBeenCalledWith('a1', 'PUBLISHED', undefined))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText(/no artworks awaiting review/i)).toBeInTheDocument())
  })

  it('prevents a duplicate publish submission while the first request is in flight', async () => {
    getSubmittedArtworks.mockResolvedValue([artwork()])
    let resolvePublish: () => void = () => {}
    moderateArtwork.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePublish = resolve
        }),
    )
    renderQueue()

    fireEvent.click(await screen.findByRole('button', { name: /^publish$/i }))
    const dialog = screen.getByRole('dialog', { name: /publish artwork/i })
    const confirmButton = within(dialog).getByRole('button', { name: /^publish$/i })

    fireEvent.click(confirmButton)
    await waitFor(() => expect(confirmButton).toBeDisabled())
    fireEvent.click(confirmButton)
    expect(moderateArtwork).toHaveBeenCalledTimes(1)

    resolvePublish()
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
  })
})

describe('ArtworkModerationQueue — reject', () => {
  it('requires a reason, then sends decision=REJECTED with it', async () => {
    getSubmittedArtworks.mockResolvedValueOnce([artwork()]).mockResolvedValueOnce([])
    moderateArtwork.mockResolvedValue(undefined)
    renderQueue()

    fireEvent.click(await screen.findByRole('button', { name: /^reject$/i }))
    const dialog = screen.getByRole('dialog', { name: /reject artwork/i })
    const confirmButton = within(dialog).getByRole('button', { name: /reject artwork/i })

    fireEvent.click(confirmButton)
    expect(moderateArtwork).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/reason is required/i)

    fireEvent.input(within(dialog).getByLabelText(/reason/i), { target: { value: 'blurry photos' } })
    fireEvent.click(confirmButton)

    await waitFor(() => expect(moderateArtwork).toHaveBeenCalledWith('a1', 'REJECTED', 'blurry photos'))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
  })

  it('shows an error toast and keeps the artwork in the queue on callable failure', async () => {
    getSubmittedArtworks.mockResolvedValue([artwork()])
    moderateArtwork.mockRejectedValue({ message: 'This artwork is not awaiting review.' })
    renderQueue()

    fireEvent.click(await screen.findByRole('button', { name: /^reject$/i }))
    const dialog = screen.getByRole('dialog', { name: /reject artwork/i })
    fireEvent.input(within(dialog).getByLabelText(/reason/i), { target: { value: 'x' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /reject artwork/i }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('This artwork is not awaiting review.'))
    expect(screen.getByText('Sunset Over the Bay')).toBeInTheDocument()
  })

  it('prevents a duplicate reject submission while the first request is in flight', async () => {
    getSubmittedArtworks.mockResolvedValue([artwork()])
    let resolveReject: () => void = () => {}
    moderateArtwork.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveReject = resolve
        }),
    )
    renderQueue()

    fireEvent.click(await screen.findByRole('button', { name: /^reject$/i }))
    const dialog = screen.getByRole('dialog', { name: /reject artwork/i })
    fireEvent.input(within(dialog).getByLabelText(/reason/i), { target: { value: 'x' } })
    const confirmButton = within(dialog).getByRole('button', { name: /reject artwork/i })

    fireEvent.click(confirmButton)
    await waitFor(() => expect(confirmButton).toBeDisabled())
    fireEvent.click(confirmButton)
    expect(moderateArtwork).toHaveBeenCalledTimes(1)

    resolveReject()
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
  })
})

// Admin moderation override (UI-03 final correction) — a SUBMITTED
// artwork's own "Suspend" action, alongside Publish/Reject.
describe('ArtworkModerationQueue — suspend (admin moderation override)', () => {
  it('requires a reason, then sends it to suspendArtwork, and the artwork leaves the queue on success', async () => {
    getSubmittedArtworks.mockResolvedValueOnce([artwork()]).mockResolvedValueOnce([])
    suspendArtwork.mockResolvedValue(undefined)
    renderQueue()

    fireEvent.click(await screen.findByRole('button', { name: /^suspend$/i }))
    const dialog = screen.getByRole('dialog', { name: /suspend artwork/i })
    const confirmButton = within(dialog).getByRole('button', { name: /^suspend$/i })

    fireEvent.click(confirmButton)
    expect(suspendArtwork).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/reason is required/i)

    fireEvent.input(within(dialog).getByLabelText(/reason/i), { target: { value: 'Reported for a policy violation.' } })
    fireEvent.click(confirmButton)

    await waitFor(() => expect(suspendArtwork).toHaveBeenCalledWith('a1', 'Reported for a policy violation.'))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText(/no artworks awaiting review/i)).toBeInTheDocument())
  })

  it('shows an error toast and keeps the artwork in the queue on callable failure', async () => {
    getSubmittedArtworks.mockResolvedValue([artwork()])
    suspendArtwork.mockRejectedValue({ message: 'This action requires an administrator account.' })
    renderQueue()

    fireEvent.click(await screen.findByRole('button', { name: /^suspend$/i }))
    const dialog = screen.getByRole('dialog', { name: /suspend artwork/i })
    fireEvent.input(within(dialog).getByLabelText(/reason/i), { target: { value: 'x' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^suspend$/i }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('This action requires an administrator account.'))
    expect(screen.getByText('Sunset Over the Bay')).toBeInTheDocument()
  })
})
