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

const getPendingSellerApplications = vi.fn()
vi.mock('../api/adminQueueRepository', () => ({
  getPendingSellerApplications: (...args: unknown[]) => getPendingSellerApplications(...args),
  getSubmittedArtworks: vi.fn(),
}))

const approveSellerApplication = vi.fn()
const rejectSellerApplication = vi.fn()
vi.mock('../api/adminApi', () => ({
  approveSellerApplication: (...args: unknown[]) => approveSellerApplication(...args),
  rejectSellerApplication: (...args: unknown[]) => rejectSellerApplication(...args),
  moderateArtwork: vi.fn(),
  isAdminActionError: (value: unknown) => typeof value === 'object' && value !== null && 'message' in value,
}))

const { SellerApplicationQueue } = await import('./SellerApplicationQueue')

function application(overrides: Record<string, unknown> = {}) {
  const now = Timestamp.now()
  return {
    uid: 'alice',
    status: 'PENDING',
    businessName: 'Alice Fine Art',
    description: 'Oil paintings and prints.',
    contactEmail: 'alice@example.com',
    appliedAt: now,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function renderQueue() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SellerApplicationQueue />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getPendingSellerApplications.mockReset()
  approveSellerApplication.mockReset()
  rejectSellerApplication.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
})

describe('SellerApplicationQueue — queue states', () => {
  it('shows a loading state', () => {
    getPendingSellerApplications.mockReturnValue(new Promise(() => {}))
    renderQueue()
    expect(screen.getByLabelText(/loading pending seller applications/i)).toBeInTheDocument()
  })

  it('shows an empty state when there are no pending applications', async () => {
    getPendingSellerApplications.mockResolvedValue([])
    renderQueue()
    expect(await screen.findByText(/no pending seller applications/i)).toBeInTheDocument()
  })

  it('shows an error state on query failure, with a retry action', async () => {
    getPendingSellerApplications.mockRejectedValue({ code: 'unknown', message: 'boom' })
    renderQueue()
    expect(await screen.findByText(/couldn't load seller applications/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('renders each pending application', async () => {
    getPendingSellerApplications.mockResolvedValue([application()])
    renderQueue()
    expect(await screen.findByText('Alice Fine Art')).toBeInTheDocument()
  })
})

describe('SellerApplicationQueue — approve', () => {
  it('requires confirmation, calls the callable, shows success, and the item leaves the queue once Firestore confirms it', async () => {
    getPendingSellerApplications.mockResolvedValueOnce([application()]).mockResolvedValueOnce([])
    approveSellerApplication.mockResolvedValue(undefined)
    renderQueue()

    fireEvent.click(await screen.findByRole('button', { name: /^approve$/i }))
    const dialog = screen.getByRole('dialog', { name: /approve seller application/i })
    expect(approveSellerApplication).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: /^approve$/i }))

    await waitFor(() => expect(approveSellerApplication).toHaveBeenCalledWith('alice'))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByText(/no pending seller applications/i)).toBeInTheDocument())
  })

  it('cancelling the dialog never invokes the callable', async () => {
    getPendingSellerApplications.mockResolvedValue([application()])
    renderQueue()

    fireEvent.click(await screen.findByRole('button', { name: /^approve$/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(approveSellerApplication).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows an error toast and keeps the item in the queue on callable failure', async () => {
    getPendingSellerApplications.mockResolvedValue([application()])
    approveSellerApplication.mockRejectedValue({ message: 'This action requires an administrator account.' })
    renderQueue()

    fireEvent.click(await screen.findByRole('button', { name: /^approve$/i }))
    const dialog = screen.getByRole('dialog', { name: /approve seller application/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /^approve$/i }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('This action requires an administrator account.'))
    expect(screen.getByText('Alice Fine Art')).toBeInTheDocument()
  })

  it('prevents a duplicate approve submission while the first request is in flight', async () => {
    getPendingSellerApplications.mockResolvedValue([application()])
    let resolveApprove: () => void = () => {}
    approveSellerApplication.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveApprove = resolve
        }),
    )
    renderQueue()

    fireEvent.click(await screen.findByRole('button', { name: /^approve$/i }))
    const dialog = screen.getByRole('dialog', { name: /approve seller application/i })
    const confirmButton = within(dialog).getByRole('button', { name: /^approve$/i })

    fireEvent.click(confirmButton)
    await waitFor(() => expect(confirmButton).toBeDisabled())

    fireEvent.click(confirmButton)
    expect(approveSellerApplication).toHaveBeenCalledTimes(1)

    resolveApprove()
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
  })
})

describe('SellerApplicationQueue — reject', () => {
  it('requires a reason before the reject dialog can be confirmed', async () => {
    getPendingSellerApplications.mockResolvedValueOnce([application()]).mockResolvedValueOnce([])
    renderQueue()

    fireEvent.click(await screen.findByRole('button', { name: /^reject$/i }))
    const dialog = screen.getByRole('dialog', { name: /reject seller application/i })
    const confirmButton = within(dialog).getByRole('button', { name: /reject application/i })

    fireEvent.click(confirmButton)
    expect(rejectSellerApplication).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/reason is required/i)

    fireEvent.input(within(dialog).getByLabelText(/reason/i), { target: { value: 'Not a fit.' } })
    fireEvent.click(confirmButton)

    await waitFor(() => expect(rejectSellerApplication).toHaveBeenCalledWith('alice', 'Not a fit.'))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
  })

  it('collapses newlines/extra whitespace before submitting the reason, matching the server contract', async () => {
    getPendingSellerApplications.mockResolvedValue([application()])
    rejectSellerApplication.mockResolvedValue(undefined)
    renderQueue()

    fireEvent.click(await screen.findByRole('button', { name: /^reject$/i }))
    const dialog = screen.getByRole('dialog', { name: /reject seller application/i })
    fireEvent.input(within(dialog).getByLabelText(/reason/i), { target: { value: 'Line one\nLine two' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /reject application/i }))

    await waitFor(() => expect(rejectSellerApplication).toHaveBeenCalledWith('alice', 'Line one Line two'))
  })

  it('shows an error toast and keeps the dialog open on callable failure', async () => {
    getPendingSellerApplications.mockResolvedValue([application()])
    rejectSellerApplication.mockRejectedValue({ message: 'This action requires an administrator account.' })
    renderQueue()

    fireEvent.click(await screen.findByRole('button', { name: /^reject$/i }))
    const dialog = screen.getByRole('dialog', { name: /reject seller application/i })
    fireEvent.input(within(dialog).getByLabelText(/reason/i), { target: { value: 'x' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /reject application/i }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('This action requires an administrator account.'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('prevents a duplicate reject submission while the first request is in flight', async () => {
    getPendingSellerApplications.mockResolvedValue([application()])
    let resolveReject: () => void = () => {}
    rejectSellerApplication.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveReject = resolve
        }),
    )
    renderQueue()

    fireEvent.click(await screen.findByRole('button', { name: /^reject$/i }))
    const dialog = screen.getByRole('dialog', { name: /reject seller application/i })
    fireEvent.input(within(dialog).getByLabelText(/reason/i), { target: { value: 'x' } })
    const confirmButton = within(dialog).getByRole('button', { name: /reject application/i })

    fireEvent.click(confirmButton)
    await waitFor(() => expect(confirmButton).toBeDisabled())

    fireEvent.click(confirmButton)
    expect(rejectSellerApplication).toHaveBeenCalledTimes(1)

    resolveReject()
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
  })
})
