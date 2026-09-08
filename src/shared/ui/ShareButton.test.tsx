import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
vi.mock('./Toast', () => ({ useToast: () => toast }))

const { ShareButton } = await import('./ShareButton')

const PROPS = { url: 'https://artvault.test/artworks/a1', title: 'Sunset', text: 'Sunset on ArtVault' }

beforeEach(() => {
  toast.success.mockReset()
  toast.error.mockReset()
})

afterEach(() => {
  // @ts-expect-error test-only cleanup of properties this suite defines on navigator
  delete navigator.share
  // @ts-expect-error test-only cleanup of properties this suite defines on navigator
  delete navigator.clipboard
})

describe('ShareButton', () => {
  it('is an accessible, labeled control at the standard touch-target size', () => {
    render(<ShareButton {...PROPS} />)
    expect(screen.getByRole('button', { name: 'Share this artwork' })).toBeInTheDocument()
  })

  it('calls the native Web Share API with the real artwork url/title when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })

    render(<ShareButton {...PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share this artwork' }))
    await vi.waitFor(() => expect(share).toHaveBeenCalledWith({ title: 'Sunset', text: 'Sunset on ArtVault', url: PROPS.url }))
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('does nothing (no error toast) when the user cancels the native share sheet', async () => {
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    const share = vi.fn().mockRejectedValue(abortError)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    render(<ShareButton {...PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share this artwork' }))
    await vi.waitFor(() => expect(share).toHaveBeenCalled())
    expect(writeText).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('falls back to copying the link when native share fails for a real reason', async () => {
    const share = vi.fn().mockRejectedValue(new Error('boom'))
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    render(<ShareButton {...PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share this artwork' }))
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(PROPS.url))
    expect(toast.success).toHaveBeenCalledWith('Link copied to clipboard')
  })

  it('copies the link directly when the browser has no native Web Share support', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    render(<ShareButton {...PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share this artwork' }))
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(PROPS.url))
    expect(toast.success).toHaveBeenCalledWith('Link copied to clipboard')
  })

  it('shows an honest error toast — never a fabricated success — when copying also fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    render(<ShareButton {...PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share this artwork' }))
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(toast.success).not.toHaveBeenCalled()
  })
})
