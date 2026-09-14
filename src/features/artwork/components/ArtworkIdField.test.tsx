import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
vi.mock('@/shared/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/ui')>()
  return { ...actual, useToast: () => toast }
})

const { ArtworkIdField } = await import('./ArtworkIdField')

beforeEach(() => {
  toast.success.mockReset()
  toast.error.mockReset()
})

afterEach(() => {
  // @ts-expect-error test-only cleanup of a property this suite defines on navigator
  delete navigator.clipboard
})

describe('ArtworkIdField', () => {
  it('shows the real artwork id as read-only text', () => {
    render(<ArtworkIdField artworkId="aB3xYz9Qk2" />)
    expect(screen.getByText('aB3xYz9Qk2')).toBeInTheDocument()
  })

  it('has a labeled Copy control', () => {
    render(<ArtworkIdField artworkId="aB3xYz9Qk2" />)
    expect(screen.getByRole('button', { name: /copy artwork id/i })).toBeInTheDocument()
  })

  it('copies the real id to the clipboard and shows a success toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    render(<ArtworkIdField artworkId="aB3xYz9Qk2" />)
    fireEvent.click(screen.getByRole('button', { name: /copy artwork id/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('aB3xYz9Qk2'))
    expect(toast.success).toHaveBeenCalledWith('Artwork ID copied to clipboard')
  })

  it('shows a clear error toast, never a crash, when the clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    render(<ArtworkIdField artworkId="aB3xYz9Qk2" />)
    fireEvent.click(screen.getByRole('button', { name: /copy artwork id/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('never exposes any field other than the artwork id itself', () => {
    render(<ArtworkIdField artworkId="aB3xYz9Qk2" />)
    expect(screen.queryByText(/sellerId|seller-id/i)).not.toBeInTheDocument()
  })
})
